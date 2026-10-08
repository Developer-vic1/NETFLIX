package com.netflix.local;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.FileInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.LinkedHashMap;

/** Resolves declared files from a persisted SAF tree and verified app-owned Wi-Fi downloads. */
public final class LibraryAccess {
    private static final int MAX_CATALOG = 8 * 1024 * 1024;
    private final Context context;
    private final SharedPreferences preferences;
    private Uri tree;
    private final Map<String, Uri> resolved = new HashMap<>();
    private Set<String> declared = new HashSet<>();
    private Map<String, Long> declaredSizes = new HashMap<>();
    private Map<String, JSONObject> managedFiles = new HashMap<>();
    private final File managedRoot;

    public LibraryAccess(Context context) {
        this.context = context.getApplicationContext();
        preferences = this.context.getSharedPreferences("netflix-local-runtime", Context.MODE_PRIVATE);
        File external = this.context.getExternalFilesDir("library");
        managedRoot = external == null ? new File(this.context.getFilesDir(), "library") : external;
        String saved = preferences.getString("library-tree", null);
        if (saved != null) tree = Uri.parse(saved);
    }

    public synchronized Uri getTreeUri() { return tree; }

    public synchronized boolean hasLibrary() {
        return tree != null || new File(managedRoot, "catalog.json").isFile();
    }

    /** Do not revoke a previous folder grant while a verified download reuses it. */
    public synchronized boolean usesTree(Uri value) {
        if (value == null) return false;
        try {
            JSONArray files = readManagedCatalog().optJSONArray("files");
            if (files == null) return false;
            for (int i = 0; i < files.length(); i++)
                if (value.toString().equals(files.getJSONObject(i).optString("safTree"))) return true;
        } catch (IOException | JSONException ignored) { return true; }
        return false;
    }

    File getManagedRoot() throws IOException {
        if (!managedRoot.isDirectory() && !managedRoot.mkdirs()) throw new IOException("No se pudo preparar el almacenamiento del teléfono.");
        return managedRoot;
    }

    public synchronized void setTree(Uri value) {
        tree = value;
        resolved.clear();
        declared.clear();
        declaredSizes.clear();
        managedFiles.clear();
        preferences.edit().putString("library-tree", value == null ? null : value.toString()).apply();
    }

    /** Validate first so a mistaken folder selection does not replace a working library. */
    public synchronized int validateTree(Uri candidate) throws IOException {
        if (candidate == null || !DocumentsContract.isTreeUri(candidate)) throw new IOException("library.invalid");
        Uri previousTree = tree;
        Set<String> previousDeclared = declared;
        Map<String, Long> previousSizes = declaredSizes;
        Map<String, JSONObject> previousManaged = managedFiles;
        try {
            tree = candidate;
            JSONObject catalog = readCatalog(candidate);
            JSONArray records = catalog.getJSONArray("records");
            Set<String> candidatePaths = new HashSet<>();
            Map<String, Long> candidateSizes = new HashMap<>();
            int count = 0;
            for (int i = 0; i < records.length(); i++) {
                JSONObject record = records.getJSONObject(i);
                if (!"published".equals(record.optString("status"))) continue;
                collectRecord(record, candidatePaths, candidateSizes);
                count++;
            }
            declaredSizes = candidateSizes;
            // Confirm transferred files without reading their payload into RAM.
            for (String path : candidatePaths) {
                try (Resource resource = openUri(find(candidate, path), mime(path))) {
                    verifySize(path, resource.length);
                }
            }
            return count;
        } catch (JSONException invalid) {
            throw new IOException("library.catalogError", invalid);
        } finally {
            tree = previousTree;
            declared = previousDeclared;
            declaredSizes = previousSizes;
            managedFiles = previousManaged;
        }
    }

    public synchronized byte[] readPublishedCatalog() throws IOException {
        JSONObject catalog = readManagedCatalog();
        LinkedHashMap<String, JSONObject> merged = new LinkedHashMap<>();
        if (tree != null) {
            try { mergeRecords(merged, readCatalog(tree).getJSONArray("records")); }
            catch (JSONException invalid) { throw new IOException("library.catalogError", invalid); }
            catch (IOException unavailable) {
                // Independently downloaded media stays usable if a removable SAF folder is absent.
                if (catalog.optJSONArray("records").length() == 0) throw unavailable;
            }
        }
        mergeRecords(merged, catalog.optJSONArray("records"));
        JSONArray result = new JSONArray();
        Set<String> allowed = new HashSet<>();
        Map<String, Long> sizes = new HashMap<>();
        for (JSONObject record : merged.values()) {
            collectRecord(record, allowed, sizes);
            result.put(record);
        }
        Map<String, JSONObject> mappings = parseManagedFiles(catalog);
        Set<String> managedPaths = new HashSet<>();
        Map<String, Long> managedSizes = new HashMap<>();
        JSONArray managedRecords = catalog.optJSONArray("records");
        for (int i = 0; i < managedRecords.length(); i++) {
            JSONObject record = managedRecords.optJSONObject(i);
            if (record != null && merged.get(record.optString("id")) == record)
                collectRecord(record, managedPaths, managedSizes);
        }
        for (String path : managedPaths)
            if (!mappings.containsKey(path)) throw new IOException("library.catalogError");
        mappings.keySet().retainAll(managedPaths);
        managedFiles = mappings;
        declared = allowed;
        declaredSizes = sizes;
        try { return new JSONObject().put("records", result).toString().getBytes(StandardCharsets.UTF_8); }
        catch (JSONException error) { throw new IOException("library.catalogError", error); }
    }

    private void mergeRecords(Map<String, JSONObject> merged, JSONArray records) throws IOException {
        if (records == null || records.length() > 1000) throw new IOException("library.catalogError");
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.optJSONObject(i);
            if (record == null) throw new IOException("library.catalogError");
            if ("published".equals(record.optString("status"))) {
                JSONObject previous = merged.get(record.optString("id"));
                if (previous == null || !newer(previous.optString("updatedAt"), record.optString("updatedAt")))
                    merged.put(record.optString("id"), record);
            }
        }
    }

    static boolean newer(String first, String second) {
        try { return java.time.OffsetDateTime.parse(first).toInstant().isAfter(java.time.OffsetDateTime.parse(second).toInstant()); }
        catch (java.time.format.DateTimeParseException invalid) { return false; }
    }

    void collectRecord(JSONObject record, Set<String> allowed, Map<String, Long> sizes) throws IOException {
            if (record == null || !"published".equals(record.optString("status"))) throw new IOException("library.catalogError");
            if (!record.optString("id").matches("local-(?:series-)?[a-f0-9-]{36}"))
                throw new IOException("library.catalogError");
            addCover(allowed, record.optString("coverUrl"));
            if ("series".equals(record.optString("kind"))) {
                JSONArray episodes = record.optJSONArray("episodes");
                if (episodes == null || episodes.length() > 1000) throw new IOException("library.catalogError");
                for (int j = 0; j < episodes.length(); j++) {
                    JSONObject episode = episodes.optJSONObject(j);
                    if (episode == null) throw new IOException("library.catalogError");
                    addVideo(allowed, sizes, episode.optJSONObject("video"));
                }
            } else if ("movie".equals(record.optString("kind"))) {
                addVideo(allowed, sizes, record.optJSONObject("video"));
            } else throw new IOException("library.catalogError");
    }

    synchronized JSONObject readManagedCatalog() throws IOException {
        AtomicFile file = new AtomicFile(new File(managedRoot, "catalog.json"));
        try (InputStream input = file.openRead()) { return parseCatalog(input); }
        catch (java.io.FileNotFoundException missing) {
            try { return new JSONObject().put("version", 1).put("records", new JSONArray()).put("files", new JSONArray()); }
            catch (JSONException impossible) { throw new IOException(impossible); }
        }
    }

    private Map<String, JSONObject> parseManagedFiles(JSONObject catalog) throws IOException {
        Map<String, JSONObject> mappings = new HashMap<>();
        JSONArray files = catalog.optJSONArray("files");
        if (files == null || files.length() > 10000) throw new IOException("library.catalogError");
        for (int i = 0; i < files.length(); i++) {
            JSONObject entry = files.optJSONObject(i);
            if (entry == null) throw new IOException("library.catalogError");
            String path = decodedPath(entry.optString("path"));
            if (!path.equals(entry.optString("path")) || entry.optLong("size") <= 0 ||
                    !entry.optString("sha256").matches("[a-f0-9]{64}") || mappings.containsKey(path)) throw new IOException("library.catalogError");
            if (entry.has("localPath")) managedFile(entry.optString("localPath"));
            else if (!DocumentsContract.isTreeUri(Uri.parse(entry.optString("safTree"))) ||
                    !decodedPath(entry.optString("safPath")).equals(entry.optString("safPath"))) throw new IOException("library.catalogError");
            mappings.put(path, entry);
        }
        return mappings;
    }

    File managedFile(String relative) throws IOException {
        if (!relative.matches("files/[a-f0-9]{64}\\.(?:mp4|mkv|jpg|png|webp)")) throw new IOException("library.invalid");
        File file = new File(getManagedRoot(), relative);
        if (!file.getCanonicalPath().startsWith(managedRoot.getCanonicalPath() + File.separator)) throw new IOException("library.invalid");
        return file;
    }

    /** Only a complete validated snapshot becomes visible to the player. AtomicFile keeps the old one after a crash. */
    synchronized void commitManagedCatalog(JSONObject catalog) throws IOException {
        Map<String, JSONObject> mappings = parseManagedFiles(catalog);
        Set<String> paths = new HashSet<>();
        Map<String, Long> sizes = new HashMap<>();
        JSONArray records = catalog.optJSONArray("records");
        if (catalog.optInt("version") != 1 || records == null || records.length() > 1000) throw new IOException("library.catalogError");
        for (int i = 0; i < records.length(); i++) collectRecord(records.optJSONObject(i), paths, sizes);
        // Validate the merged visible catalog BEFORE replacing its persisted snapshot.
        LinkedHashMap<String, JSONObject> visible = new LinkedHashMap<>();
        if (tree != null) {
            try { mergeRecords(visible, readCatalog(tree).getJSONArray("records")); }
            catch (JSONException invalid) { throw new IOException("library.catalogError", invalid); }
            catch (IOException unavailable) { /* Independent downloads can publish without a removable source. */ }
        }
        mergeRecords(visible, records);
        Set<String> visiblePaths = new HashSet<>();
        Map<String, Long> visibleSizes = new HashMap<>();
        for (JSONObject record : visible.values()) collectRecord(record, visiblePaths, visibleSizes);
        for (String path : paths) {
            JSONObject entry = mappings.get(path);
            if (entry == null || sizes.containsKey(path) && sizes.get(path) != entry.optLong("size")) throw new IOException("library.catalogError");
            try (Resource resource = openManaged(entry)) {
                if (resource.length != entry.optLong("size")) throw new IOException("library.sourceChanged");
            }
        }
        byte[] bytes = catalog.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_CATALOG) throw new IOException("library.catalogError");
        AtomicFile atomic = new AtomicFile(new File(getManagedRoot(), "catalog.json"));
        FileOutputStream output = null;
        try { output = atomic.startWrite(); output.write(bytes); atomic.finishWrite(output); }
        catch (IOException error) { if (output != null) atomic.failWrite(output); throw error; }
        readPublishedCatalog();
    }

    synchronized String[] candidatePaths(String path, long size) throws IOException {
        readPublishedCatalog();
        java.util.ArrayList<String> result = new java.util.ArrayList<>();
        if (declared.contains(path)) result.add(path);
        for (String candidate : declared) {
            Long expected = declaredSizes.get(candidate);
            if (!candidate.equals(path) && expected != null && expected == size) result.add(candidate);
        }
        return result.toArray(new String[0]);
    }

    synchronized JSONObject reusableMapping(String target, String existing, long size, String hash) throws IOException {
        JSONObject previous = managedFiles.get(existing);
        try {
            JSONObject result = previous == null ? new JSONObject() : new JSONObject(previous.toString());
            result.put("path", target).put("size", size).put("sha256", hash);
            if (previous == null) {
                if (tree == null) throw new IOException("library.sourceUnavailable");
                result.put("safTree", tree.toString()).put("safPath", existing);
            }
            return result;
        } catch (JSONException invalid) { throw new IOException("library.catalogError", invalid); }
    }

    private Resource openManaged(JSONObject entry) throws IOException {
        if (entry.has("localPath")) {
            File file = managedFile(entry.optString("localPath"));
            return new Resource(new FileInputStream(file), file.length(), mime(entry.optString("path")));
        }
        return openUri(find(Uri.parse(entry.optString("safTree")), entry.optString("safPath")), mime(entry.optString("path")));
    }

    private void addCover(Set<String> allowed, String value) throws IOException {
        String path = decodedPath(value);
        if (!path.matches("data/library/covers/[a-zA-Z0-9_-]+\\.(?:jpg|png|webp)"))
            throw new IOException("library.catalogError");
        allowed.add(path);
    }

    private void addVideo(Set<String> allowed, Map<String, Long> sizes, JSONObject value) throws IOException {
        if (value == null || value.optLong("size", 0) <= 0) throw new IOException("library.catalogError");
        String path = decodedPath(value.optString("url"));
        if (!path.matches("(?:videos|series|assets/videos/library)/[a-zA-Z0-9_#.-]+\\.(?:mp4|mkv)"))
            throw new IOException("library.catalogError");
        allowed.add(path);
        long expected = value.optLong("size", 0);
        if (sizes.containsKey(path) && sizes.get(path) != expected) throw new IOException("library.catalogError");
        sizes.put(path, expected);
    }

    static String decodedPath(String value) throws IOException {
        try {
            String path = java.net.URLDecoder.decode(value.replace("+", "%2B"), "UTF-8");
            if (path.startsWith("/") || path.contains("\\") || path.indexOf('\0') >= 0)
                throw new IOException("library.invalid");
            for (String part : path.split("/", -1))
                if (part.isEmpty() || part.equals(".") || part.equals("..")) throw new IOException("library.invalid");
            return path;
        } catch (IllegalArgumentException error) { throw new IOException("library.invalid", error); }
    }

    private JSONObject readCatalog(Uri root) throws IOException {
        if (root == null || !DocumentsContract.isTreeUri(root)) throw new IOException("library.invalid");
        Uri file = find(root, "data/library/catalog.json");
        try (Resource resource = openUri(file, "application/json")) {
            if (resource.length < 0 || resource.length > MAX_CATALOG) throw new IOException("library.catalogError");
            return parseCatalog(resource.stream);
        } catch (SecurityException error) { throw new IOException("library.catalogError", error); }
    }

    private JSONObject parseCatalog(InputStream input) throws IOException {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (bytes.size() + count > MAX_CATALOG) throw new IOException("library.catalogError");
                bytes.write(buffer, 0, count);
            }
            JSONObject data = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            JSONArray records = data.optJSONArray("records");
            if (data.optInt("version") != 1 || records == null || records.length() > 1000)
                throw new IOException("library.catalogError");
            return data;
        } catch (JSONException | SecurityException error) { throw new IOException("library.catalogError", error); }
    }

    /** Opens no undeclared media even when the chosen tree contains other personal files. */
    public synchronized Resource open(String path) throws IOException {
        if (!declared.contains(path)) readPublishedCatalog();
        if (!declared.contains(path)) throw new IOException("library.sourceUnavailable");
        JSONObject managed = managedFiles.get(path);
        if (managed != null) {
            Resource resource = openManaged(managed);
            try {
                verifySize(path, resource.length);
                if (resource.length != managed.optLong("size")) throw new IOException("library.sourceChanged");
                return resource;
            }
            catch (IOException changed) { resource.close(); throw changed; }
        }
        if (tree == null) throw new IOException("library.sourceUnavailable");
        Uri value = resolved.get(path);
        if (value == null) {
            value = find(tree, path);
            if (resolved.size() >= 4096) resolved.clear();
            resolved.put(path, value);
        }
        Resource resource = openUri(value, mime(path));
        try {
            verifySize(path, resource.length);
            return resource;
        } catch (IOException changed) {
            resource.close();
            throw changed;
        }
    }

    private void verifySize(String path, long actual) throws IOException {
        Long expected = declaredSizes.get(path);
        if (actual <= 0 || expected != null && actual != expected)
            throw new IOException("library.sourceChanged");
        if (expected == null && actual > 12 * 1024 * 1024) throw new IOException("library.coverError");
    }

    private Uri find(Uri root, String path) throws IOException {
        String identifier = DocumentsContract.getTreeDocumentId(root);
        String[] parts = path.split("/");
        for (int index = 0; index < parts.length; index++) {
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(root, identifier);
            String found = null;
            try (Cursor cursor = context.getContentResolver().query(children,
                    new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                            DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
                if (cursor == null) throw new IOException("library.sourceUnavailable");
                while (cursor.moveToNext()) {
                    if (!parts[index].equals(cursor.getString(1))) continue;
                    boolean directory = DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(2));
                    if (directory != (index < parts.length - 1)) throw new IOException("library.invalid");
                    if (found != null) throw new IOException("library.invalid");
                    found = cursor.getString(0);
                }
            } catch (SecurityException | IllegalArgumentException error) {
                throw new IOException("library.permissionDenied", error);
            }
            if (found == null) throw new IOException("library.sourceUnavailable");
            identifier = found;
        }
        return DocumentsContract.buildDocumentUriUsingTree(root, identifier);
    }

    private Resource openUri(Uri file, String mime) throws IOException {
        ParcelFileDescriptor descriptor = null;
        try {
            descriptor = context.getContentResolver().openFileDescriptor(file, "r");
            if (descriptor == null) throw new IOException("library.sourceUnavailable");
            long size = descriptor.getStatSize();
            if (size < 0) {
                try (Cursor cursor = context.getContentResolver().query(file,
                        new String[]{OpenableColumns.SIZE}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) size = cursor.getLong(0);
                }
            }
            if (size < 0) throw new IOException("library.sourceUnavailable");
            return new Resource(new ParcelFileDescriptor.AutoCloseInputStream(descriptor), size, mime);
        } catch (IOException | SecurityException | IllegalArgumentException error) {
            if (descriptor != null) descriptor.close();
            throw new IOException("library.sourceUnavailable", error);
        }
    }

    public static String mime(String path) {
        String lower = path.toLowerCase(java.util.Locale.US);
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".mkv")) return "video/x-matroska";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json; charset=utf-8";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".vtt")) return "text/vtt; charset=utf-8";
        return "application/octet-stream";
    }

    public static final class Resource implements Closeable {
        public final InputStream stream;
        public final long length;
        public final String mime;
        private final long initialPosition;
        Resource(InputStream stream, long length, String mime) throws IOException {
            this.stream = stream; this.length = length; this.mime = mime;
            initialPosition = stream instanceof FileInputStream
                    ? ((FileInputStream) stream).getChannel().position() : 0;
        }
        public void seek(long offset) throws IOException {
            if (offset == 0) return;
            if (stream instanceof FileInputStream) {
                ((FileInputStream) stream).getChannel().position(initialPosition + offset);
                return;
            }
            long skipped = 0;
            while (skipped < offset) {
                long delta = stream.skip(offset - skipped);
                if (delta <= 0) throw new IOException("library.rangeUnavailable");
                skipped += delta;
            }
        }
        @Override public void close() throws IOException { stream.close(); }
    }
}
