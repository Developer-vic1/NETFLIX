package com.netflix.local;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Resolves only the catalog and its declared files inside a persisted SAF tree. */
public final class LibraryAccess {
    private static final int MAX_CATALOG = 8 * 1024 * 1024;
    private final Context context;
    private final SharedPreferences preferences;
    private Uri tree;
    private final Map<String, Uri> resolved = new HashMap<>();
    private Set<String> declared = new HashSet<>();
    private Map<String, Long> declaredSizes = new HashMap<>();

    public LibraryAccess(Context context) {
        this.context = context.getApplicationContext();
        preferences = this.context.getSharedPreferences("netflix-local-runtime", Context.MODE_PRIVATE);
        String saved = preferences.getString("library-tree", null);
        if (saved != null) tree = Uri.parse(saved);
    }

    public synchronized Uri getTreeUri() { return tree; }

    public synchronized void setTree(Uri value) {
        tree = value;
        resolved.clear();
        declared.clear();
        declaredSizes.clear();
        preferences.edit().putString("library-tree", value == null ? null : value.toString()).apply();
    }

    /** Validate first so a mistaken folder selection does not replace a working library. */
    public synchronized int validateTree(Uri candidate) throws IOException {
        if (candidate == null || !DocumentsContract.isTreeUri(candidate)) throw new IOException("library.invalid");
        Uri previousTree = tree;
        Set<String> previousDeclared = declared;
        Map<String, Long> previousSizes = declaredSizes;
        try {
            tree = candidate;
            byte[] catalog = readPublishedCatalog();
            // Confirm transferred files without reading their payload into RAM.
            for (String path : declared) {
                try (Resource resource = openUri(find(candidate, path), mime(path))) {
                    verifySize(path, resource.length);
                }
            }
            return new JSONObject(new String(catalog, StandardCharsets.UTF_8)).getJSONArray("records").length();
        } catch (JSONException invalid) {
            throw new IOException("library.catalogError", invalid);
        } finally {
            tree = previousTree;
            declared = previousDeclared;
            declaredSizes = previousSizes;
        }
    }

    public synchronized byte[] readPublishedCatalog() throws IOException {
        if (tree == null) return "{\"records\":[]}".getBytes(StandardCharsets.UTF_8);
        JSONObject catalog = readCatalog(tree);
        JSONArray result = new JSONArray();
        Set<String> allowed = new HashSet<>();
        Map<String, Long> sizes = new HashMap<>();
        JSONArray records = catalog.optJSONArray("records");
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.optJSONObject(i);
            if (record == null || !"published".equals(record.optString("status"))) continue;
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
            result.put(record);
        }
        declared = allowed;
        declaredSizes = sizes;
        try { return new JSONObject().put("records", result).toString().getBytes(StandardCharsets.UTF_8); }
        catch (JSONException error) { throw new IOException("library.catalogError", error); }
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
            ByteArrayOutputStream bytes = new ByteArrayOutputStream((int) Math.min(resource.length, 65536));
            byte[] buffer = new byte[16384];
            int count;
            while ((count = resource.stream.read(buffer)) >= 0) {
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
        if (tree == null) throw new IOException("library.sourceUnavailable");
        if (!declared.contains(path)) readPublishedCatalog();
        if (!declared.contains(path)) throw new IOException("library.sourceUnavailable");
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
