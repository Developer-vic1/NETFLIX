package com.netflix.local;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Native, resumable LAN transfers. No WebView bridge, no full video in memory, and no writes to the SAF originals. */
public final class WifiLibrarySync {
    private static final int MAX_JSON = 8 * 1024 * 1024;
    private static final int BUFFER = 64 * 1024;
    private static final long RESERVE = 64L * 1024 * 1024;
    private final LibraryAccess library;
    private volatile boolean cancelled;
    private final Set<HttpURLConnection> connections = new HashSet<>();

    public WifiLibrarySync(Context context, LibraryAccess library) { this.library = library; }

    public interface ProgressListener {
        void onProgress(long doneBytes, long totalBytes, String message);
    }

    public static final class Session {
        public final String address;
        public final String token;
        public final JSONArray records;
        private Session(String address, String token, JSONArray records) {
            this.address = address; this.token = token; this.records = records;
        }
    }

    public static final class Availability {
        public final long pendingBytes;
        public final int newEpisodes;
        public final boolean complete;
        private Availability(long pendingBytes, int newEpisodes, boolean complete) {
            this.pendingBytes = pendingBytes; this.newEpisodes = newEpisodes; this.complete = complete;
        }
    }

    /** Cheap eligibility check for the selector. Actual transfers still verify the entire SHA256 payload. */
    public Map<String, Availability> availableDownloads(Session session) throws IOException {
        checkCancelled();
        validateSession(session);
        Map<String, JSONObject> saved = new HashMap<>();
        try {
            JSONArray local = new JSONObject(new String(library.readPublishedCatalog(), StandardCharsets.UTF_8)).getJSONArray("records");
            for (int i = 0; i < local.length(); i++) {
                JSONObject record = local.getJSONObject(i);
                saved.put(record.getString("id"), record);
            }
        } catch (JSONException invalid) { throw new IOException("No se pudo comprobar el catálogo guardado en el teléfono.", invalid); }
        LinkedHashMap<String, Availability> result = new LinkedHashMap<>();
        for (int i = 0; i < session.records.length(); i++) {
            checkCancelled();
            JSONObject remote = session.records.optJSONObject(i);
            if (remote == null) throw new IOException("El catálogo compartido contiene un título inválido.");
            String id = remote.optString("id");
            JSONObject local = saved.get(id);
            long pending = 0;
            int newEpisodes = 0;
            int videoCount = 0;
            int missingVideos = 0;
            if ("series".equals(remote.optString("kind"))) {
                Map<String, JSONObject> localEpisodes = new HashMap<>();
                JSONArray previous = local != null && "series".equals(local.optString("kind")) ? local.optJSONArray("episodes") : null;
                if (previous != null) for (int j = 0; j < previous.length(); j++) {
                    JSONObject episode = previous.optJSONObject(j);
                    if (episode != null) localEpisodes.put(episode.optString("id"), episode);
                }
                JSONArray episodes = remote.optJSONArray("episodes");
                if (episodes == null) throw new IOException("Una serie no incluye sus capítulos.");
                videoCount = episodes.length();
                for (int j = 0; j < episodes.length(); j++) {
                    JSONObject episode = episodes.optJSONObject(j);
                    if (episode == null) throw new IOException("Una serie contiene un capítulo inválido.");
                    JSONObject existing = localEpisodes.get(episode.optString("id"));
                    JSONObject video = episode.optJSONObject("video");
                    if (!videoAvailable(video, existing == null ? null : existing.optJSONObject("video"))) {
                        pending = checkedAdd(pending, video == null ? 0 : video.optLong("size"));
                        newEpisodes++;
                        missingVideos++;
                    }
                }
            } else if ("movie".equals(remote.optString("kind"))) {
                videoCount = 1;
                JSONObject video = remote.optJSONObject("video");
                if (!videoAvailable(video, local != null && "movie".equals(local.optString("kind")) ? local.optJSONObject("video") : null)) {
                    pending = video == null ? 0 : video.optLong("size");
                    missingVideos++;
                }
            } else throw new IOException("El tipo de título compartido no es válido.");
            result.put(id, new Availability(pending, newEpisodes, videoCount > 0 && missingVideos == 0));
        }
        return result;
    }

    private boolean videoAvailable(JSONObject remote, JSONObject local) throws IOException {
        checkCancelled();
        if (remote == null || local == null || remote.optLong("size") <= 0 || remote.optLong("size") != local.optLong("size")) return false;
        String path = LibraryAccess.decodedPath(local.optString("url"));
        if (!path.equals(LibraryAccess.decodedPath(remote.optString("url")))) return false;
        try (LibraryAccess.Resource resource = library.open(path)) { return resource.length == remote.optLong("size"); }
        catch (IOException unavailable) { checkCancelled(); return false; }
    }

    /** Tokens are kept in memory only. The six-digit code is never saved. */
    public Session pairAndList(String address, String code) throws IOException {
        checkCancelled(); // Cancellation stays effective even before the worker starts.
        String base = validateAddress(address);
        if (code == null || !code.matches("[0-9]{6}")) throw new IOException("Escribe el código de seis dígitos que muestra la computadora.");
        try {
            JSONObject paired = requestJson(base, null, "/api/pair", new JSONObject().put("code", code), 30000);
            String token = paired.optString("token");
            if (!token.matches("[A-Za-z0-9_-]{24,256}")) throw new IOException("La computadora devolvió una respuesta de conexión inválida.");
            return validatedSession(base, token, requestJson(base, token, "/api/catalog", null, 30000));
        } catch (JSONException invalid) { throw new IOException("Respuesta de conexión inválida.", invalid); }
    }

    /** Fetch current published titles while retaining the existing in-memory authorization. */
    public Session refresh(Session session) throws IOException {
        checkCancelled();
        validateSession(session);
        return validatedSession(session.address, session.token,
                requestJson(session.address, session.token, "/api/catalog", null, 30000));
    }

    /** A green connection state requires a fresh authenticated server response, not just Wi-Fi availability. */
    public void checkConnection(Session session) throws IOException {
        checkCancelled();
        validateSession(session);
        JSONObject response = requestJson(session.address, session.token, "/api/status", null, 3000, 4096);
        if (!"connected".equals(response.optString("status")))
            throw new IOException("La computadora no confirmó una conexión activa.");
    }

    private void validateSession(Session session) throws IOException {
        if (session == null || !validateAddress(session.address).equals(session.address) || session.token == null ||
                !session.token.matches("[A-Za-z0-9_-]{24,256}"))
            throw new IOException("La sesión de conexión no es válida. Vuelve a vincular la computadora.");
    }

    private Session validatedSession(String base, String token, JSONObject catalog) throws IOException {
            JSONArray records = catalog.optJSONArray("records");
            if (catalog.optInt("version") != 1 || records == null || records.length() > 1000)
                throw new IOException("El catálogo compartido no es válido.");
            Set<String> paths = new HashSet<>();
            Map<String, Long> sizes = new HashMap<>();
            Set<String> ids = new HashSet<>();
            for (int i = 0; i < records.length(); i++) {
                JSONObject record = records.optJSONObject(i);
                library.collectRecord(record, paths, sizes);
                if (!ids.add(record.optString("id"))) throw new IOException("El catálogo contiene un título repetido.");
            }
            return new Session(base, token, records);
    }

    /** Run on the Activity's worker. Only selected, fully verified titles are published locally. */
    public int sync(Session session, Set<String> selectedIds, ProgressListener listener) throws IOException {
        checkCancelled();
        if (session == null || selectedIds == null || selectedIds.isEmpty()) throw new IOException("Selecciona al menos una película o serie.");
        validateAddress(session.address);
        Set<String> offered = new HashSet<>();
        for (int i = 0; i < session.records.length(); i++) offered.add(session.records.optJSONObject(i).optString("id"));
        if (!offered.containsAll(selectedIds)) throw new IOException("Un título seleccionado ya no pertenece al catálogo compartido.");
        StringBuilder ids = new StringBuilder();
        for (String id : selectedIds) { if (ids.length() > 0) ids.append(','); ids.append(id); }
        emit(listener, 0, 0, "La computadora prepara las firmas de los videos; los archivos grandes pueden tardar varios minutos.");
        JSONObject manifest = requestJson(session.address, session.token,
                "/api/manifest?ids=" + encode(ids.toString()), null, 300000);
        checkCancelled();
        JSONArray records = manifest.optJSONArray("records");
        JSONArray fileArray = manifest.optJSONArray("files");
        if (manifest.optInt("version") != 1 || records == null || records.length() != selectedIds.size() ||
                fileArray == null || fileArray.length() > 10000) throw new IOException("La lista de descarga está incompleta.");
        Set<String> needed = new HashSet<>();
        Map<String, Long> videoSizes = new HashMap<>();
        Set<String> receivedIds = new HashSet<>();
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.optJSONObject(i);
            library.collectRecord(record, needed, videoSizes);
            if (!selectedIds.contains(record.optString("id")) || !receivedIds.add(record.optString("id")))
                throw new IOException("La computadora cambió la selección de títulos; vuelve a conectarte.");
        }
        LinkedHashMap<String, JSONObject> remoteFiles = new LinkedHashMap<>();
        long total = 0;
        for (int i = 0; i < fileArray.length(); i++) {
            JSONObject entry = fileArray.optJSONObject(i);
            if (entry == null) throw new IOException("Archivo inválido en la lista de descarga.");
            String path = entry.optString("path");
            long size = entry.optLong("size");
            if (!LibraryAccess.decodedPath(path).equals(path) || !needed.contains(path) || remoteFiles.containsKey(path) ||
                    size <= 0 || !entry.optString("sha256").matches("[a-f0-9]{64}") ||
                    videoSizes.containsKey(path) && videoSizes.get(path) != size ||
                    !videoSizes.containsKey(path) && size > 12L * 1024 * 1024)
                throw new IOException("Los datos de un video o portada son inconsistentes.");
            total = checkedAdd(total, size);
            remoteFiles.put(path, entry);
        }
        if (!remoteFiles.keySet().equals(needed)) throw new IOException("Faltan archivos para completar los títulos seleccionados.");

        File root = library.getManagedRoot();
        File staging = new File(root, "partial");
        File complete = new File(root, "files");
        if ((!staging.isDirectory() && !staging.mkdirs()) || (!complete.isDirectory() && !complete.mkdirs()))
            throw new IOException("No se pudo crear la carpeta de descargas.");
        if (!staging.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator))
            throw new IOException("Ruta de descargas inválida.");
        LinkedHashMap<String, JSONObject> ready = new LinkedHashMap<>();
        long done = 0;
        long remaining = 0;
        Map<String, String> checkedFiles = new HashMap<>();
        for (JSONObject entry : remoteFiles.values()) {
            checkCancelled();
            String path = entry.optString("path");
            long size = entry.optLong("size");
            String hash = entry.optString("sha256");
            emit(listener, done, total, "Comprobando si ya tienes " + filename(path) + " para evitar duplicados…");
            JSONObject reused = null;
            for (String candidate : library.candidatePaths(path, size)) {
                checkCancelled();
                try (LibraryAccess.Resource resource = library.open(candidate)) {
                    if (resource.length != size) continue;
                    String digest = checkedFiles.get(candidate);
                    if (digest == null) {
                        digest = sha256(resource.stream, listener, done, total, "Verificando " + filename(candidate));
                        checkedFiles.put(candidate, digest);
                    }
                    if (hash.equals(digest)) { reused = library.reusableMapping(path, candidate, size, hash); break; }
                } catch (IOException unavailable) { if (cancelled) throw unavailable; }
            }
            if (reused == null) {
                File destination = library.managedFile(localPath(entry));
                if (destination.isFile() && destination.length() == size) {
                    try (InputStream input = new FileInputStream(destination)) {
                        if (hash.equals(sha256(input, listener, done, total, "Verificando descarga anterior"))) reused = localMapping(entry);
                    }
                }
                if (destination.exists() && reused == null)
                    throw new IOException("Una descarga anterior cambió. Conservamos el archivo; revisa el almacenamiento antes de reintentar.");
            }
            if (reused != null) { ready.put(path, reused); done += size; }
            else {
                File partial = partialFile(staging, entry);
                if (partial.exists() && partial.length() > size) throw new IOException("Una descarga parcial tiene un tamaño inválido.");
                remaining = checkedAdd(remaining, size - (partial.isFile() ? partial.length() : 0));
            }
        }
        if (root.getUsableSpace() < checkedAdd(remaining, RESERVE))
            throw new IOException("Espacio insuficiente en el teléfono: libera " + humanBytes(remaining + RESERVE) + " antes de descargar.");
        for (JSONObject entry : remoteFiles.values()) {
            checkCancelled();
            String path = entry.optString("path");
            long size = entry.optLong("size");
            if (ready.containsKey(path)) continue;
            File partial = partialFile(staging, entry);
            File destination = library.managedFile(localPath(entry));
            download(session, entry, partial, listener, done, total);
            emit(listener, done + size, total, "Verificando integridad de " + filename(path) + "…");
            try (InputStream input = new FileInputStream(partial)) {
                if (!entry.optString("sha256").equals(sha256(input, listener, done + size, total, "Verificando " + filename(path)))) {
                    // This is an app-owned partial file, never an original or a published file.
                    if (!partial.delete()) throw new IOException("La descarga está dañada y no se pudo limpiar. No se publicó el título.");
                    throw new IOException("La descarga no coincide con el original. Vuelve a intentar; tu biblioteca anterior sigue intacta.");
                }
            }
            checkCancelled();
            if (destination.exists()) throw new IOException("Existe otra descarga con el mismo nombre; no se sobrescribió.");
            try { Files.move(partial.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE); }
            catch (java.nio.file.AtomicMoveNotSupportedException unsupported) { Files.move(partial.toPath(), destination.toPath()); }
            ready.put(path, localMapping(entry));
            done += size;
            emit(listener, done, total, filename(path) + " verificado y guardado.");
        }
        checkCancelled();
        emit(listener, total, total, "Todos los archivos están completos. Incorporando los títulos al catálogo…");
        publish(records, ready);
        emit(listener, total, total, "Biblioteca actualizada. Ya puedes ver estos títulos sin Wi-Fi ni computadora.");
        return records.length();
    }

    private void publish(JSONArray added, Map<String, JSONObject> ready) throws IOException {
        JSONObject existing = library.readManagedCatalog();
        LinkedHashMap<String, JSONObject> records = new LinkedHashMap<>();
        JSONArray oldRecords = existing.optJSONArray("records");
        for (int i = 0; i < oldRecords.length(); i++) records.put(oldRecords.optJSONObject(i).optString("id"), oldRecords.optJSONObject(i));
        for (int i = 0; i < added.length(); i++) records.put(added.optJSONObject(i).optString("id"), added.optJSONObject(i));
        Map<String, JSONObject> mappings = new HashMap<>();
        JSONArray oldFiles = existing.optJSONArray("files");
        for (int i = 0; i < oldFiles.length(); i++) mappings.put(oldFiles.optJSONObject(i).optString("path"), oldFiles.optJSONObject(i));
        mappings.putAll(ready);
        Set<String> paths = new HashSet<>();
        Map<String, Long> sizes = new HashMap<>();
        JSONArray allRecords = new JSONArray();
        for (JSONObject record : records.values()) { library.collectRecord(record, paths, sizes); allRecords.put(record); }
        JSONArray allFiles = new JSONArray();
        for (String path : paths) {
            JSONObject entry = mappings.get(path);
            if (entry == null) throw new IOException("La biblioteca anterior está incompleta; no se reemplazó el catálogo.");
            allFiles.put(entry);
        }
        try { library.commitManagedCatalog(new JSONObject().put("version", 1).put("records", allRecords).put("files", allFiles)); }
        catch (JSONException invalid) { throw new IOException("No se pudo guardar el catálogo local.", invalid); }
    }

    private void download(Session session, JSONObject entry, File partial, ProgressListener listener, long done, long total) throws IOException {
        long size = entry.optLong("size");
        long offset = partial.isFile() ? partial.length() : 0;
        if (offset == size) return;
        HttpURLConnection connection = connect(session.address, session.token, "/api/files/" + encodePath(entry.optString("path")), 45000);
        try {
            if (offset > 0) connection.setRequestProperty("Range", "bytes=" + offset + "-");
            int status = connection.getResponseCode();
            checkCancelled();
            if (offset > 0 && status == 200) offset = 0; // Server did not accept a resume; safely restart only our partial.
            else if (status != (offset > 0 ? 206 : 200)) throw httpError(status);
            if (status == 206 && !validContentRange(connection.getHeaderField("Content-Range"), offset, size))
                throw new IOException("La computadora respondió con un fragmento incorrecto; descarga detenida.");
            String encoding = connection.getHeaderField("Content-Encoding");
            if (encoding != null && !"identity".equalsIgnoreCase(encoding)) throw new IOException("El servidor cambió el formato de transferencia.");
            long expectedLength = connection.getContentLengthLong();
            if (expectedLength >= 0 && expectedLength != size - offset) throw new IOException("El tamaño anunciado del video no coincide.");
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial, offset > 0)) {
                byte[] buffer = new byte[BUFFER];
                long bytes = offset;
                long update = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    checkCancelled();
                    if (count == 0) continue;
                    if (bytes > size - count) throw new IOException("La computadora envió más datos de los esperados.");
                    output.write(buffer, 0, count);
                    bytes += count;
                    long now = System.nanoTime();
                    if (now - update > 250000000L) { emit(listener, done + bytes, total, "Descargando " + filename(entry.optString("path"))); update = now; }
                }
                output.getFD().sync();
                if (bytes != size) throw new IOException("La conexión se interrumpió. La próxima descarga continuará desde lo guardado.");
            }
        } finally { close(connection); }
    }

    public void cancel() {
        cancelled = true;
        synchronized (connections) {
            for (HttpURLConnection connection : connections) connection.disconnect();
            connections.clear();
        }
    }

    private void checkCancelled() throws IOException { if (cancelled || Thread.currentThread().isInterrupted()) throw new IOException("Descarga cancelada. Los títulos completos siguen disponibles y los pendientes pueden continuar después."); }

    private HttpURLConnection connect(String base, String token, String path, int readTimeout) throws IOException {
        checkCancelled();
        HttpURLConnection connection = (HttpURLConnection) new URL(base + path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(Math.min(readTimeout, 15000));
        connection.setReadTimeout(readTimeout);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept-Encoding", "identity");
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        synchronized (connections) { checkCancelled(); connections.add(connection); }
        return connection;
    }

    private void close(HttpURLConnection connection) { synchronized (connections) { connections.remove(connection); } connection.disconnect(); }

    private JSONObject requestJson(String base, String token, String path, JSONObject body, int timeout) throws IOException {
        return requestJson(base, token, path, body, timeout, MAX_JSON);
    }

    private JSONObject requestJson(String base, String token, String path, JSONObject body, int timeout, int limit) throws IOException {
        HttpURLConnection connection = connect(base, token, path, timeout);
        try {
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json"); connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status != 200) throw httpError(status);
            if (connection.getContentLengthLong() > limit) throw new IOException("La respuesta del catálogo es demasiado grande.");
            try (InputStream input = connection.getInputStream()) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[16384]; int count;
                while ((count = input.read(buffer)) != -1) {
                    checkCancelled();
                    if (bytes.size() > limit - count) throw new IOException("La respuesta del catálogo es demasiado grande.");
                    bytes.write(buffer, 0, count);
                }
                return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            }
        } catch (JSONException invalid) { throw new IOException("La computadora respondió con un catálogo inválido.", invalid); }
        finally { close(connection); }
    }

    private IOException httpError(int status) {
        if (status == 401 || status == 403) return new IOException("El código o la sesión caducó. Conéctate de nuevo con el código que muestra la computadora.");
        if (status >= 300 && status < 400) return new IOException("Se rechazó una redirección fuera de la conexión local.");
        if (status == 409 || status == 404) return new IOException("La biblioteca cambió en la computadora; vuelve a consultar el catálogo.");
        if (status == 429) return new IOException("Demasiados intentos de conexión; espera un momento y vuelve a intentarlo.");
        return new IOException("La computadora no pudo completar la solicitud (HTTP " + status + ").");
    }

    private String sha256(InputStream input, ProgressListener listener, long done, long total, String message) throws IOException {
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) { throw new IOException(impossible); }
        byte[] buffer = new byte[BUFFER]; int count; long update = 0;
        while ((count = input.read(buffer)) != -1) {
            checkCancelled(); digest.update(buffer, 0, count);
            long now = System.nanoTime();
            if (now - update > 500000000L) { emit(listener, done, total, message); update = now; }
        }
        StringBuilder value = new StringBuilder(64);
        for (byte number : digest.digest()) value.append(String.format(java.util.Locale.US, "%02x", number & 255));
        return value.toString();
    }

    private static String localPath(JSONObject entry) { String path = entry.optString("path"); return "files/" + entry.optString("sha256") + path.substring(path.lastIndexOf('.')).toLowerCase(java.util.Locale.US); }
    private static File partialFile(File staging, JSONObject entry) { return new File(staging, entry.optString("sha256") + ".part"); }
    private static JSONObject localMapping(JSONObject entry) throws IOException {
        try { return new JSONObject().put("path", entry.optString("path")).put("size", entry.optLong("size")).put("sha256", entry.optString("sha256")).put("localPath", localPath(entry)); }
        catch (JSONException invalid) { throw new IOException(invalid); }
    }
    private static void emit(ProgressListener listener, long done, long total, String message) { if (listener != null) listener.onProgress(done, total, message); }
    private static String filename(String path) { return path.substring(path.lastIndexOf('/') + 1); }
    private static String humanBytes(long value) { return String.format(java.util.Locale.US, "%.2f GB", value / (1024d * 1024 * 1024)); }
    static long checkedAdd(long first, long second) throws IOException { if (second < 0 || first < 0 || first > Long.MAX_VALUE - second) throw new IOException("El tamaño de la biblioteca es inválido."); return first + second; }
    private static String encode(String value) throws IOException { return URLEncoder.encode(value, "UTF-8").replace("+", "%20"); }
    static String encodePath(String path) throws IOException { StringBuilder value = new StringBuilder(); for (String part : path.split("/")) { if (value.length() > 0) value.append('/'); value.append(encode(part)); } return value.toString(); }

    /** Numeric RFC1918 addresses only: no DNS resolution, credentials, localhost, public endpoints, or redirects. */
    public static String validateAddress(String value) throws IOException {
        try {
            String text = value == null ? "" : value.trim();
            if (!text.startsWith("http://")) text = "http://" + text;
            URI uri = new URI(text);
            String host = uri.getHost();
            if (!"http".equals(uri.getScheme()) || host == null || uri.getUserInfo() != null || uri.getQuery() != null ||
                    uri.getFragment() != null || !("".equals(uri.getPath()) || "/".equals(uri.getPath()))) throw new IOException("address");
            String[] parts = host.split("\\.", -1);
            if (parts.length != 4) throw new IOException("address");
            int[] octets = new int[4];
            for (int i = 0; i < 4; i++) {
                if (!parts[i].matches("0|[1-9][0-9]{0,2}")) throw new IOException("address");
                octets[i] = Integer.parseInt(parts[i]); if (octets[i] > 255) throw new IOException("address");
            }
            if (!(octets[0] == 10 || octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] == 192 && octets[1] == 168)) throw new IOException("address");
            int port = uri.getPort(); if (port == -1) port = 4184;
            if (port < 1024 || port > 65535) throw new IOException("address");
            return "http://" + host + ":" + port;
        } catch (java.net.URISyntaxException | IllegalArgumentException | IOException invalid) {
            throw new IOException("Usa la dirección privada que muestra la computadora, por ejemplo http://192.168.1.10:4184. Ambos equipos deben estar en la misma red.", invalid);
        }
    }

    static boolean validContentRange(String value, long offset, long size) {
        if (value == null) return false;
        return value.equals("bytes " + offset + "-" + (size - 1) + "/" + size);
    }
}
