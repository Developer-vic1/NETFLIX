package com.netflix.local;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Small loopback-only HTTP server. Media uses a 64 KiB buffer, never a whole-file byte array. */
public final class LocalMediaServer implements Closeable {
    private final Context context;
    private final LibraryAccess library;
    private final Set<Socket> connections = Collections.synchronizedSet(new HashSet<Socket>());
    private ServerSocket listener;
    private ThreadPoolExecutor workers;
    private volatile boolean running;
    private int port;
    private volatile String connectionState = "{\"state\":\"idle\",\"title\":\"Biblioteca en el teléfono\",\"detail\":\"Conecta para añadir títulos nuevos\"}";

    public void setConnectionState(String state, String title, String detail) {
        try { connectionState = new org.json.JSONObject().put("state", state).put("title", title).put("detail", detail).toString(); }
        catch (org.json.JSONException ignored) { }
    }

    public LocalMediaServer(Context context, LibraryAccess library) {
        this.context = context.getApplicationContext();
        this.library = library;
    }

    public synchronized int start() throws IOException {
        if (running) return port;
        int preferred = context.getSharedPreferences("netflix-local-runtime", Context.MODE_PRIVATE)
                .getInt("http-port", 41739);
        listener = new ServerSocket();
        listener.setReuseAddress(true);
        try { listener.bind(new java.net.InetSocketAddress(InetAddress.getByName("127.0.0.1"), preferred), 32); }
        catch (IOException unavailable) {
            listener.close();
            listener = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
        }
        port = listener.getLocalPort();
        context.getSharedPreferences("netflix-local-runtime", Context.MODE_PRIVATE)
                .edit().putInt("http-port", port).apply();
        workers = new ThreadPoolExecutor(4, 4, 30, TimeUnit.SECONDS,
                new ArrayBlockingQueue<Runnable>(32), runnable -> {
                    Thread thread = new Thread(runnable, "netflix-local-http");
                    thread.setDaemon(true);
                    return thread;
                });
        workers.allowCoreThreadTimeOut(true);
        running = true;
        Thread acceptor = new Thread(this::accept, "netflix-local-listener");
        acceptor.setDaemon(true);
        acceptor.start();
        return port;
    }

    public synchronized int getPort() { return port; }
    public synchronized String getBaseUrl() { return "http://127.0.0.1:" + port; }

    private void accept() {
        while (running) {
            Socket socket = null;
            try {
                socket = listener.accept();
                socket.setSoTimeout(15000);
                socket.setTcpNoDelay(true);
                socket.setSendBufferSize(65536);
                connections.add(socket);
                final Socket current = socket;
                workers.execute(() -> serve(current));
            } catch (RejectedExecutionException saturated) {
                // Close immediately instead of accumulating video jobs or response buffers.
                discard(socket);
            } catch (IOException | NullPointerException stopped) {
                discard(socket);
                if (!running) break;
            }
        }
    }

    private void serve(Socket socket) {
        try (Socket current = socket) {
            InputStream input = new BufferedInputStream(current.getInputStream(), 4096);
            OutputStream output = current.getOutputStream();
            Request request = readRequest(input);
            if (request == null) return;
            String expectedHost = "127.0.0.1:" + port;
            if (!expectedHost.equals(request.headers.get("host"))) {
                error(output, 403, "library.permissionDenied", request.head);
                return;
            }
            String origin = request.headers.get("origin");
            if (origin != null && !getBaseUrl().equals(origin)) {
                error(output, 403, "library.permissionDenied", request.head);
                return;
            }
            if (!request.method.equals("GET") && !request.head) {
                error(output, 405, "library.mobileReadOnly", false);
                return;
            }
            String path;
            try {
                String target = request.target;
                if (!target.startsWith("/") || target.startsWith("//")) throw new IOException("invalid path");
                int query = target.indexOf('?');
                if (query >= 0) target = target.substring(0, query);
                path = target.equals("/") ? "index.html" : LibraryAccess.decodedPath(target.substring(1));
                for (int i = 0; i < path.length(); i++)
                    if (Character.isISOControl(path.charAt(i))) throw new IOException("invalid path");
            } catch (IOException invalid) {
                error(output, 400, "library.invalid", request.head);
                return;
            }
            if (path.equals("api/library")) {
                try {
                    byte[] data = library.readPublishedCatalog();
                    sendBytes(output, data, "application/json; charset=utf-8", request.head);
                } catch (IOException unavailable) {
                    error(output, 503, unavailable.getMessage().startsWith("library.")
                            ? unavailable.getMessage() : "library.catalogUnavailable", request.head);
                }
                return;
            }
            if (path.equals("api/runtime")) {
                String data = "{\"platform\":\"android\",\"readOnly\":true,\"offline\":true,\"libraryAttached\":"
                        + library.hasLibrary() + ",\"connection\":" + connectionState + "}";
                sendBytes(output, data.getBytes(StandardCharsets.UTF_8), "application/json; charset=utf-8", request.head);
                return;
            }
            if (path.startsWith("api/")) {
                error(output, 405, "library.mobileReadOnly", request.head);
                return;
            }
            boolean responseStarted = false;
            try (LibraryAccess.Resource resource = open(path)) {
                long[] range;
                try { range = requestedRange(request.headers.get("range"), resource.length); }
                catch (IllegalArgumentException invalid) {
                    headers(output, 416, "text/plain; charset=utf-8", 0,
                            "Content-Range: bytes */" + resource.length + "\r\n");
                    return;
                }
                long start = range[0], end = range[1];
                long count = resource.length == 0 ? 0 : end - start + 1;
                // Seek before writing the success status: SAF providers must support local seeking.
                if (!request.head) resource.seek(start);
                boolean partial = request.headers.containsKey("range");
                headers(output, partial ? 206 : 200, resource.mime, count,
                        "Accept-Ranges: bytes\r\n" + (partial
                                ? "Content-Range: bytes " + start + "-" + end + "/" + resource.length + "\r\n" : ""));
                responseStarted = true;
                if (!request.head) {
                    byte[] buffer = new byte[65536];
                    while (running && count > 0) {
                        int length = resource.stream.read(buffer, 0, (int) Math.min(count, buffer.length));
                        if (length < 0) break;
                        if (length == 0) continue;
                        output.write(buffer, 0, length);
                        count -= length;
                    }
                }
            } catch (IOException | SecurityException unavailable) {
                if (!responseStarted) android.util.Log.e("NetflixLocal", "Resource unavailable: " + path, unavailable);
                // Socket failures cancel the stream immediately. A missing source receives a clear status.
                if (!responseStarted && !current.isClosed()) {
                    boolean changed = "library.sourceChanged".equals(unavailable.getMessage());
                    try { error(output, changed ? 409 : 404,
                            changed ? "library.sourceChanged" : "library.sourceUnavailable", request.head); }
                    catch (IOException cancelled) { /* Browser cancelled its range request. */ }
                }
            }
        } catch (IOException | RuntimeException malformed) {
            // One malformed or cancelled client cannot stop the media server.
        } finally { connections.remove(socket); }
    }

    private LibraryAccess.Resource open(String path) throws IOException {
        if (path.startsWith("videos/") || path.startsWith("series/") || path.startsWith("data/library/")
                || path.startsWith("assets/videos/library/")) return library.open(path);
        try {
            AssetFileDescriptor descriptor = context.getAssets().openFd("www/" + path);
            InputStream stream = descriptor.createInputStream();
            return new LibraryAccess.Resource(stream, descriptor.getLength(), LibraryAccess.mime(path));
        } catch (IOException compressed) {
            InputStream stream = context.getAssets().open("www/" + path);
            // Android AssetInputStream.available reports the asset's remaining size (bundled UI only).
            return new LibraryAccess.Resource(stream, stream.available(), LibraryAccess.mime(path));
        }
    }

    /** Single byte ranges only, including suffix ranges. Bad/multiple ranges return HTTP 416. */
    static long[] requestedRange(String value, long length) {
        if (length < 0) throw new IllegalArgumentException("unknown length");
        if (value == null) return new long[]{0, length == 0 ? -1 : length - 1};
        if (length == 0 || !value.matches("bytes=\\d*-\\d*")) throw new IllegalArgumentException("range");
        String[] sides = value.substring(6).split("-", -1);
        try {
            if (sides[0].isEmpty()) {
                long suffix = Long.parseLong(sides[1]);
                if (suffix <= 0) throw new IllegalArgumentException("suffix");
                return new long[]{Math.max(0, length - suffix), length - 1};
            }
            long start = Long.parseLong(sides[0]);
            long end = sides[1].isEmpty() ? length - 1 : Long.parseLong(sides[1]);
            if (start < 0 || start >= length || end < start) throw new IllegalArgumentException("range");
            return new long[]{start, Math.min(end, length - 1)};
        } catch (NumberFormatException overflow) { throw new IllegalArgumentException("range", overflow); }
    }

    private Request readRequest(InputStream input) throws IOException {
        String first = line(input, 8192);
        if (first == null || first.isEmpty()) return null;
        String[] parts = first.split(" ", -1);
        if (parts.length != 3 || !parts[2].matches("HTTP/1\\.[01]")) throw new IOException("request");
        Map<String, String> headers = new HashMap<>();
        int size = first.length();
        for (int count = 0; count < 64; count++) {
            String line = line(input, 8192);
            if (line == null) throw new IOException("headers");
            size += line.length();
            if (size > 32768) throw new IOException("headers");
            if (line.isEmpty()) return new Request(parts[0], parts[1], headers);
            int separator = line.indexOf(':');
            if (separator <= 0) throw new IOException("header");
            String key = line.substring(0, separator).toLowerCase(Locale.US);
            if (!key.matches("[a-z0-9-]+") || headers.containsKey(key)) throw new IOException("header");
            headers.put(key, line.substring(separator + 1).trim());
        }
        throw new IOException("headers");
    }

    private static String line(InputStream input, int maximum) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(128);
        while (bytes.size() <= maximum) {
            int value = input.read();
            if (value < 0) return bytes.size() == 0 ? null : new String(bytes.toByteArray(), StandardCharsets.US_ASCII);
            if (value == '\n') {
                byte[] data = bytes.toByteArray();
                int length = data.length;
                if (length > 0 && data[length - 1] == '\r') length--;
                return new String(data, 0, length, StandardCharsets.US_ASCII);
            }
            bytes.write(value);
        }
        throw new IOException("line too long");
    }

    private static void sendBytes(OutputStream output, byte[] data, String type, boolean head) throws IOException {
        headers(output, 200, type, data.length, "");
        if (!head) output.write(data);
    }

    private static void error(OutputStream output, int status, String code, boolean head) throws IOException {
        byte[] data = ("{\"error\":\"" + code.replaceAll("[^a-zA-Z0-9.]", "") + "\"}")
                .getBytes(StandardCharsets.UTF_8);
        headers(output, status, "application/json; charset=utf-8", data.length, status == 405 ? "Allow: GET, HEAD\r\n" : "");
        if (!head) output.write(data);
    }

    private static void headers(OutputStream output, int status, String type, long length, String extra) throws IOException {
        String reason = status == 200 ? "OK" : status == 206 ? "Partial Content" : status == 400 ? "Bad Request"
                : status == 403 ? "Forbidden" : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed"
                : status == 409 ? "Conflict"
                : status == 416 ? "Range Not Satisfiable" : "Service Unavailable";
        String value = "HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + type
                + "\r\nContent-Length: " + length + "\r\nConnection: close\r\nCache-Control: no-store\r\n"
                + "X-Content-Type-Options: nosniff\r\n" + extra + "\r\n";
        output.write(value.getBytes(StandardCharsets.US_ASCII));
    }

    private void discard(Socket socket) {
        if (socket == null) return;
        connections.remove(socket);
        try { socket.close(); } catch (IOException ignored) { }
    }

    @Override public synchronized void close() {
        running = false;
        if (listener != null) try { listener.close(); } catch (IOException ignored) { }
        synchronized (connections) {
            for (Socket socket : connections) try { socket.close(); } catch (IOException ignored) { }
            connections.clear();
        }
        if (workers != null) workers.shutdownNow();
    }

    public void stop() { close(); }

    private static final class Request {
        final String method, target;
        final Map<String, String> headers;
        final boolean head;
        Request(String method, String target, Map<String, String> headers) {
            this.method = method; this.target = target; this.headers = headers;
            head = method.equals("HEAD");
        }
    }
}
