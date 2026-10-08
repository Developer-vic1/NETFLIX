package com.netflix.local;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;

/** Opt-in physical-device QA against a one-title fixture; never accesses or replaces the user's library. */
public final class SmokeInstrumentation extends Instrumentation {
    private Bundle arguments;
    private int checks;
    @Override public void onCreate(Bundle values) { arguments = values; start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        File qaRoot = null;
        Context target = getTargetContext();
        try {
            String address = WifiLibrarySync.validateAddress(arguments.getString("address"));
            String code = arguments.getString("code");
            File external = target.getExternalFilesDir(null);
            if (external == null) throw new IOException("External app storage unavailable");
            String suffix = "wifi-check-" + System.currentTimeMillis();
            qaRoot = new File(external, suffix);
            if (!qaRoot.mkdirs()) throw new IOException("Cannot create isolated QA directory");
            final File isolated = qaRoot;
            final String preferencePrefix = suffix + "-";
            SharedPreferences normalPreferences = target.getSharedPreferences("netflix-local-runtime", Context.MODE_PRIVATE);
            String normalTree = normalPreferences.getString("library-tree", null);
            File normalCatalog = new File(target.getExternalFilesDir("library"), "catalog.json");
            String normalCatalogHash = normalCatalog.isFile() ? hash(new FileInputStream(normalCatalog)) : null;
            ContextWrapper wrapper = new ContextWrapper(target) {
                @Override public Context getApplicationContext() { return this; }
                @Override public File getExternalFilesDir(String type) { return new File(isolated, type == null ? "external" : type); }
                @Override public File getFilesDir() { return new File(isolated, "internal"); }
                @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                    return super.getSharedPreferences(preferencePrefix + name, mode);
                }
            };
            LibraryAccess library = new LibraryAccess(wrapper);
            WifiLibrarySync engine = new WifiLibrarySync(wrapper, library);
            WifiLibrarySync.Session session = engine.pairAndList(address, code);
            check(session.records.length() == 1, "The test server must contain exactly one isolated fixture title");
            JSONObject expectedRecord = session.records.getJSONObject(0);
            String id = expectedRecord.getString("id");
            WifiLibrarySync.Availability initial = engine.availableDownloads(session).get(id);
            check(initial != null && !initial.complete && initial.pendingBytes > 0,
                    "A fixture missing from the phone must be eligible with its pending video bytes");
            JSONObject manifest = fetchJson(session, "/api/manifest?ids=" + URLEncoder.encode(id, "UTF-8"));
            JSONArray expectedFiles = manifest.getJSONArray("files");
            check(expectedFiles.length() >= 2, "Fixture must declare video and cover");
            WifiLibrarySync.ProgressListener progress = (done, total, message) -> {
                Bundle status = new Bundle();
                status.putString("phase", message);
                status.putLong("done", done); status.putLong("total", total);
                sendStatus(0, status);
            };
            boolean interrupted = false;
            try { engine.sync(session, Collections.singleton(id), progress); }
            catch (IOException expected) { interrupted = true; report("Expected first transfer interruption: " + expected.getMessage()); }
            check(interrupted, "The fixture server must interrupt its first video transfer");
            check(records(library).length() == 0, "Interrupted transfer must not publish any title");
            File partialDirectory = new File(library.getManagedRoot(), "partial");
            long partialBytes = 0;
            File[] partialFiles = partialDirectory.listFiles();
            if (partialFiles != null) for (File file : partialFiles) partialBytes += file.length();
            check(partialBytes > 0, "Interrupted transfer must preserve nonempty resumable partial data");
            check(engine.sync(session, Collections.singleton(id), progress) == 1, "Retry must publish exactly one title");
            check(records(library).length() == 1, "Completed retry must expose exactly one title");
            WifiLibrarySync.Availability completed = engine.availableDownloads(session).get(id);
            check(completed != null && completed.complete && completed.pendingBytes == 0 && completed.newEpisodes == 0,
                    "A fully saved title must be ineligible for another download");
            File completeDirectory = new File(library.getManagedRoot(), "files");
            int countBefore = fileCount(completeDirectory);
            long bytesBefore = directoryBytes(completeDirectory);
            check(countBefore > 0, "Completed files must exist");
            check(engine.sync(session, Collections.singleton(id), progress) == 1, "Resync of an identical title must succeed");
            check(fileCount(completeDirectory) == countBefore && directoryBytes(completeDirectory) == bytesBefore,
                    "Identical resync must not create another physical copy");
            LibraryAccess restarted = new LibraryAccess(wrapper);
            JSONArray persisted = records(restarted);
            check(restarted.hasLibrary(), "Managed library must remain connected after restart without SAF");
            check(persisted.length() == 1 && id.equals(persisted.getJSONObject(0).getString("id")), "Restart must preserve the title ID");
            WifiLibrarySync.Availability restartedAvailability = new WifiLibrarySync(wrapper, restarted).availableDownloads(session).get(id);
            check(restartedAvailability != null && restartedAvailability.complete && restartedAvailability.pendingBytes == 0,
                    "A fully saved title must remain ineligible after restart");
            check(expectedRecord.getJSONObject("metadata").toString().equals(persisted.getJSONObject(0).getJSONObject("metadata").toString()),
                    "Restart must preserve the exact fixture metadata");
            for (int i = 0; i < expectedFiles.length(); i++) {
                JSONObject entry = expectedFiles.getJSONObject(i);
                try (LibraryAccess.Resource resource = restarted.open(entry.getString("path"))) {
                    check(resource.length == entry.getLong("size"), "Published resource size must equal manifest");
                    check(entry.getString("sha256").equals(hash(resource.stream)), "Published resource must match the whole original SHA256");
                }
            }
            String afterCatalogHash = normalCatalog.isFile() ? hash(new FileInputStream(normalCatalog)) : null;
            check(equalNullable(normalCatalogHash, afterCatalogHash), "User's normal managed catalog must remain unchanged");
            check(equalNullable(normalTree, normalPreferences.getString("library-tree", null)), "User's chosen folder preference must remain unchanged");
            // Read a fixture-server counter proving HTTP Range was exercised, not a restarted full transfer.
            JSONObject stats = fetchJson(session, "/api/test-stats");
            check(stats.optInt("resumedRequests") >= 1, "Server must observe a positive Range resume request");
            check(stats.optInt("fullVideoRequests") == 1, "Repeated sync must not redownload the entire video");
            // Metadata edits alone must not ask the user to select the same complete video again.
            JSONObject metadataEdited = new JSONObject(expectedRecord.toString());
            metadataEdited.put("updatedAt", "2099-10-08T10:00:00+00:00");
            metadataEdited.getJSONObject("metadata").put("description", "Changed metadata only");
            session.records.put(0, metadataEdited);
            check(engine.availableDownloads(session).get(id).complete, "Metadata-only changes must not enable a complete video again");
            // Build an isolated local series using the already verified fixture video, then offer one new chapter.
            JSONObject localSeries = new JSONObject(expectedRecord.toString());
            String seriesId = "local-series-00000000-0000-4000-8000-000000000001";
            String firstEpisodeId = "episode-00000000-0000-4000-8000-000000000001";
            JSONObject firstEpisode = new JSONObject().put("id", firstEpisodeId).put("name", "Episode 1")
                    .put("season", 1).put("number", 1).put("video", expectedRecord.getJSONObject("video"));
            localSeries.put("id", seriesId).put("kind", "series").put("episodes", new JSONArray().put(firstEpisode));
            localSeries.remove("video");
            JSONObject savedCatalog = library.readManagedCatalog();
            savedCatalog.put("records", new JSONArray().put(localSeries));
            library.commitManagedCatalog(savedCatalog);
            JSONObject remoteSeries = new JSONObject(localSeries.toString());
            JSONObject secondEpisode = new JSONObject(firstEpisode.toString()).put("id", "episode-00000000-0000-4000-8000-000000000002")
                    .put("name", "Episode 2").put("number", 2);
            JSONObject secondVideo = new JSONObject(expectedRecord.getJSONObject("video").toString());
            secondVideo.put("url", "series/new-chapter.mp4");
            secondEpisode.put("video", secondVideo);
            remoteSeries.getJSONArray("episodes").put(secondEpisode);
            session.records.put(0, remoteSeries);
            WifiLibrarySync.Availability newChapter = engine.availableDownloads(session).get(seriesId);
            check(!newChapter.complete && newChapter.newEpisodes == 1 && newChapter.pendingBytes == secondVideo.getLong("size"),
                    "An existing series must offer only the one new chapter's bytes");
            secondEpisode.put("id", firstEpisodeId);
            WifiLibrarySync.Availability changedSource = engine.availableDownloads(session).get(seriesId);
            check(!changedSource.complete && changedSource.newEpisodes == 1,
                    "A changed episode source must remain eligible even if its video has the same size");
            result.putString("STATUS", "passed"); result.putInt("checks", checks);
            report(checks + " physical Android Wi-Fi checks passed");
            cleanup(qaRoot, external);
            wrapper.getSharedPreferences("netflix-local-runtime", Context.MODE_PRIVATE).edit().clear().commit();
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("STATUS", "error"); result.putString("error", android.util.Log.getStackTraceString(error));
            try {
                if (qaRoot != null) cleanup(qaRoot, target.getExternalFilesDir(null));
            } catch (IOException cleanupError) { result.putString("cleanupError", cleanupError.getMessage()); }
            finish(1, result);
        }
    }

    private JSONArray records(LibraryAccess library) throws Exception {
        return new JSONObject(new String(library.readPublishedCatalog(), StandardCharsets.UTF_8)).getJSONArray("records");
    }
    private void check(boolean condition, String reason) { if (!condition) throw new AssertionError(reason); checks++; }
    private void report(String message) { Bundle status = new Bundle(); status.putString("stream", message + "\n"); sendStatus(0, status); }
    private static boolean equalNullable(Object first, Object second) { return first == null ? second == null : first.equals(second); }
    private static int fileCount(File root) { File[] files = root.listFiles(); return files == null ? 0 : files.length; }
    private static long directoryBytes(File root) { long total = 0; File[] files = root.listFiles(); if (files != null) for (File file : files) total += file.length(); return total; }
    private static String hash(InputStream input) throws Exception {
        try (InputStream owned = input) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256"); byte[] buffer = new byte[65536]; int count;
            while ((count = owned.read(buffer)) != -1) digest.update(buffer, 0, count);
            StringBuilder value = new StringBuilder(64);
            for (byte item : digest.digest()) value.append(String.format(java.util.Locale.US, "%02x", item & 255));
            return value.toString();
        }
    }
    private static JSONObject fetchJson(WifiLibrarySync.Session session, String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(session.address + path).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        connection.setRequestProperty("Authorization", "Bearer " + session.token);
        try {
            if (connection.getResponseCode() != 200) throw new IOException("Fixture response " + connection.getResponseCode());
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[16384]; int count;
            try (InputStream input = connection.getInputStream()) {
                while ((count = input.read(buffer)) != -1) { if (bytes.size() + count > 8388608) throw new IOException("Fixture response too large"); bytes.write(buffer, 0, count); }
            }
            return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        } finally { connection.disconnect(); }
    }
    private static void cleanup(File qaRoot, File appExternal) throws IOException {
        if (appExternal == null || !qaRoot.getName().matches("wifi-check-[0-9]+") ||
                !qaRoot.getCanonicalFile().getParentFile().equals(appExternal.getCanonicalFile())) throw new IOException("Refused cleanup outside isolated QA directory");
        removeChild(qaRoot, qaRoot.getCanonicalPath());
    }
    private static void removeChild(File file, String rootPath) throws IOException {
        String absolute = file.getCanonicalPath();
        if (!absolute.equals(rootPath) && !absolute.startsWith(rootPath + File.separator)) throw new IOException("Refused QA symlink cleanup");
        File[] children = file.listFiles(); if (children != null) for (File child : children) removeChild(child, rootPath);
        if (file.exists() && !file.delete()) throw new IOException("Cannot remove QA file " + file.getName());
    }
}
