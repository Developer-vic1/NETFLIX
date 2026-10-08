package com.netflix.local;

import java.io.IOException;

/** Pure JVM checks for the native boundary: LAN addresses, exact ranges, encoding and >2 GiB arithmetic. */
public final class WifiSyncCheck {
    private static int checks;
    private interface Operation { void run() throws Exception; }
    private static void equals(Object expected, Object actual) {
        if (!expected.equals(actual)) throw new AssertionError("Expected " + expected + "; got " + actual);
        checks++;
    }
    private static void rejects(Operation operation) throws Exception {
        try { operation.run(); throw new AssertionError("Accepted invalid input"); }
        catch (IOException expected) { checks++; }
    }
    public static void main(String[] args) throws Exception {
        equals("http://192.168.1.20:4184", WifiLibrarySync.validateAddress("192.168.1.20"));
        equals("http://10.2.3.4:8080", WifiLibrarySync.validateAddress(" http://10.2.3.4:8080/ "));
        equals("http://172.16.0.2:4184", WifiLibrarySync.validateAddress("172.16.0.2:4184"));
        equals("http://172.31.255.254:65535", WifiLibrarySync.validateAddress("172.31.255.254:65535"));
        for (final String value : new String[]{
                "127.0.0.1:4184", "localhost:4184", "8.8.8.8:4184", "172.15.2.3", "172.32.1.2", "169.254.1.2",
                "192.168.01.2", "192.168.1.256", "192.168.1", "192.168.1.2.evil.test", "3232235778",
                "https://192.168.1.2:4184", "ftp://192.168.1.2", "http://user:secret@192.168.1.2:4184",
                "http://192.168.1.2:4184/api", "http://192.168.1.2:4184?token=a", "http://192.168.1.2:4184#foo",
                "192.168.1.2:0", "192.168.1.2:80", "192.168.1.2:65536", "[::1]:4184", "", null
        }) rejects(() -> WifiLibrarySync.validateAddress(value));
        equals("series/la-isla_T11_%231.mp4", WifiLibrarySync.encodePath("series/la-isla_T11_#1.mp4"));
        equals("data/library/covers/a%20b%2Bc.png", WifiLibrarySync.encodePath("data/library/covers/a b+c.png"));
        equals(9000000000L, WifiLibrarySync.checkedAdd(8000000000L, 1000000000L));
        rejects(() -> WifiLibrarySync.checkedAdd(Long.MAX_VALUE, 1));
        rejects(() -> WifiLibrarySync.checkedAdd(1, -1));
        rejects(() -> WifiLibrarySync.checkedAdd(-1, 1));
        equals(true, WifiLibrarySync.validContentRange("bytes 8000000000-8999999999/9000000000", 8000000000L, 9000000000L));
        equals(false, WifiLibrarySync.validContentRange("bytes 0-8999999999/9000000000", 8000000000L, 9000000000L));
        equals(false, WifiLibrarySync.validContentRange("bytes 8000000000-8999999998/9000000000", 8000000000L, 9000000000L));
        equals(false, WifiLibrarySync.validContentRange("bytes 8000000000-8999999999/9000000001", 8000000000L, 9000000000L));
        equals(false, WifiLibrarySync.validContentRange(null, 1, 2));
        equals(true, LibraryAccess.newer("2026-10-08T10:00:00+00:00", "2026-10-08T09:00:00Z"));
        equals(false, LibraryAccess.newer("2026-10-08T05:00:00-04:00", "2026-10-08T10:00:00+00:00"));
        equals(false, LibraryAccess.newer("2026-10-08T10:00:00Z", "2026-10-08T10:00:00+00:00"));
        equals(false, LibraryAccess.newer("", "2026-10-08T10:00:00Z"));
        System.out.println(checks + " native Wi-Fi boundary checks passed");
    }
}
