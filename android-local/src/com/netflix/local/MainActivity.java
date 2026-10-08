package com.netflix.local;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Android owns folder access and the bounded local HTTP server; the page has no native bridge. */
public final class MainActivity extends Activity {
    private static final int REQUEST_FOLDER = 10;
    private static final int BACKGROUND = 0xff101010;
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private LibraryAccess library;
    private LocalMediaServer server;
    private String appOrigin;
    private FrameLayout root;
    private LinearLayout normal;
    private TextView status;
    private Button folder;
    private Button wifi;
    private WifiSyncDialog wifiSync;
    private ConnectionBar connectionBar;
    private boolean connectionPanelRequested;
    private ProgressBar progress;
    private WebView web;
    private View fullScreenView;
    private WebChromeClient.CustomViewCallback fullScreenCallback;
    private boolean destroyed;
    private boolean choosingFolder;
    private boolean folderBusy;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        library = new LibraryAccess(getApplicationContext());
        buildScreen();
        startLocalServer();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void buildScreen() {
        root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        normal = new LinearLayout(this);
        normal.setOrientation(LinearLayout.VERTICAL);
        root.addView(normal, new FrameLayout.LayoutParams(-1, -1));

        connectionBar = new ConnectionBar(this);
        connectionBar.setVisibility(getPreferences(0).getBoolean("connection-hidden", false) ? View.GONE : View.VISIBLE);
        connectionBar.hideButton().setOnClickListener(v -> {
            connectionPanelRequested = false;
            getPreferences(0).edit().putBoolean("connection-hidden", true).apply();
            connectionBar.setVisibility(View.GONE);
        });
        status = connectionBar.statusLabel();
        folder = connectionBar.folderButton();
        folder.setOnClickListener(v -> explainFolder());
        wifi = connectionBar.wifiButton();
        wifi.setOnClickListener(v -> {
            if (folderBusy || appOrigin == null) return;
            ensureWifiSync();
            wifiSync.show();
        });
        normal.addView(connectionBar, new LinearLayout.LayoutParams(-1, -2));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(true);
        normal.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        setContentView(root);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (fullScreenView == null) {
                root.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            } else root.setPadding(0, 0, 0, 0);
            return insets.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
    }

    private void startLocalServer() {
        work.execute(() -> {
            try {
                LocalMediaServer created = new LocalMediaServer(getApplicationContext(), library);
                created.start();
                runOnUiThread(() -> {
                    if (destroyed) { created.close(); return; }
                    server = created;
                    appOrigin = created.getBaseUrl();
                    if (appOrigin.endsWith("/")) appOrigin = appOrigin.substring(0, appOrigin.length() - 1);
                    createWebView();
                    updateStatus();
                    web.loadUrl(appOrigin + "/index.html#/home");
                    handleConnectionIntent();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (destroyed) return;
                    progress.setVisibility(View.GONE);
                    status.setText("No se pudo iniciar");
                    new AlertDialog.Builder(this).setTitle("No se pudo abrir la aplicación")
                        .setMessage("El servicio local no pudo iniciarse. Cierra la aplicación y vuelve a abrirla.")
                        .setPositiveButton("Cerrar", (dialog, which) -> finish()).show();
                });
            }
        });
    }

    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setBuiltInZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return navigate(request.getUrl());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                progress.setIndeterminate(false);
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                updateStatus();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame() || destroyed) return;
                progress.setVisibility(View.GONE);
                new AlertDialog.Builder(MainActivity.this).setTitle("No se pudo cargar la pantalla")
                    .setMessage("La biblioteca se conserva. Intenta volver a cargar la interfaz.")
                    .setPositiveButton("Reintentar", (dialog, which) -> web.reload())
                    .setNegativeButton("Cerrar", null).show();
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                exitFullScreen();
                normal.removeView(view);
                view.destroy();
                web = null;
                if (!destroyed) {
                    status.setText("Reproductor detenido");
                    new AlertDialog.Builder(MainActivity.this).setTitle("La reproducción se detuvo")
                        .setMessage("Android liberó el reproductor. La biblioteca sigue guardada; puedes volver a abrirla.")
                        .setPositiveButton("Abrir biblioteca", (dialog, which) -> {
                            if (!destroyed && web == null) { createWebView(); web.loadUrl(appOrigin + "/index.html#/home"); }
                        }).setNegativeButton("Cerrar", (dialog, which) -> finish()).show();
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullScreenView != null) { callback.onCustomViewHidden(); return; }
                fullScreenView = view;
                fullScreenCallback = callback;
                normal.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
                root.setPadding(0, 0, 0, 0);
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
                root.requestApplyInsets();
            }
            @Override public void onHideCustomView() { exitFullScreen(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                callback.onReceiveValue(null);
                Toast.makeText(MainActivity.this,
                    "Conecta tu carpeta con el botón Carpeta. La biblioteca del teléfono es de solo lectura.", Toast.LENGTH_LONG).show();
                return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> new AlertDialog.Builder(this)
            .setTitle("Video en tu dispositivo")
            .setMessage("Los videos conectados ya están guardados en la carpeta Netflix. No hace falta descargarlos otra vez.")
            .setPositiveButton("Entendido", null).show());
        normal.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private boolean navigate(Uri uri) {
        if ("netflixlocal".equals(uri.getScheme()) && "connection".equals(uri.getHost())) {
            connectionPanelRequested = true;
            connectionBar.setVisibility(View.VISIBLE);
            return true;
        }
        if ("netflixlocal".equals(uri.getScheme()) && "downloads".equals(uri.getHost())) {
            ensureWifiSync();
            wifiSync.show();
            return true;
        }
        Uri local = Uri.parse(appOrigin);
        if ("http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPort() == local.getPort()) return false;
        if ("https".equals(uri.getScheme())) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (ActivityNotFoundException ignored) { Toast.makeText(this, "No hay un navegador para abrir el enlace.", Toast.LENGTH_LONG).show(); }
        } else Toast.makeText(this, "Ese enlace no está permitido en la aplicación.", Toast.LENGTH_SHORT).show();
        return true;
    }

    private void updateStatus() {
        if (!folderBusy) status.setText(library.hasLibrary() ? "Biblioteca local lista" : "Aún no hay videos locales");
    }

    private void ensureWifiSync() {
        if (wifiSync == null) wifiSync = new WifiSyncDialog(this, library, () -> {
            updateStatus();
            if (web != null) web.loadUrl(appOrigin + "/index.html?sync=" + System.currentTimeMillis() + "#/home");
        }, active -> { folder.setEnabled(!active); wifi.setEnabled(!active); },
            (state, title, detail) -> {
                connectionBar.setConnection(state, title, detail);
                if (server != null) server.setConnectionState(state, title, detail);
                if ("connected".equals(state) && !connectionPanelRequested) {
                    getPreferences(0).edit().putBoolean("connection-hidden", true).apply();
                    connectionBar.setVisibility(View.GONE);
                }
            });
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleConnectionIntent();
    }

    private void handleConnectionIntent() {
        if (appOrigin == null || folderBusy) return;
        Uri link = getIntent().getData();
        if (link == null || !"netflixlocal".equals(link.getScheme()) || !"connect".equals(link.getHost())) return;
        setIntent(new Intent(this, MainActivity.class));
        java.util.Set<String> names = link.getQueryParameterNames();
        if (names.size() != 2 || !names.contains("address") || !names.contains("code")) {
            Toast.makeText(this, "Este enlace de conexión no es válido.", Toast.LENGTH_LONG).show();
            return;
        }
        exitFullScreen();
        ensureWifiSync();
        wifiSync.connectDirect(link.getQueryParameter("address"), link.getQueryParameter("code"));
    }

    private void explainFolder() {
        if (folderBusy || choosingFolder) return;
        new AlertDialog.Builder(this).setTitle("Tu biblioteca, sin computadora")
            .setMessage("Copia primero la carpeta Netflix preparada para Android al teléfono. Luego selecciona esa carpeta: debe contener data/library/catalog.json y las carpetas videos y series. Los archivos se reproducen directamente, sin duplicarlos.")
            .setPositiveButton("Elegir carpeta", (dialog, which) -> chooseFolder())
            .setNegativeButton("Ahora no", null).show();
    }

    private void chooseFolder() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        if (library.getTreeUri() != null) intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, library.getTreeUri());
        try { choosingFolder = true; startActivityForResult(intent, REQUEST_FOLDER); }
        catch (ActivityNotFoundException error) {
            choosingFolder = false;
            new AlertDialog.Builder(this).setTitle("Selector de carpetas no disponible")
                .setMessage("Activa la aplicación Archivos del sistema para conectar tu biblioteca.")
                .setPositiveButton("Entendido", null).show();
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != REQUEST_FOLDER) return;
        choosingFolder = false;
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        final Uri tree = data.getData();
        final int grantFlags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
        folderBusy = true;
        folder.setEnabled(false);
        status.setText("Leyendo catálogo…");
        progress.setIndeterminate(true);
        progress.setVisibility(View.VISIBLE);
        work.execute(() -> {
            try {
                int count = library.validateTree(tree);
                getContentResolver().takePersistableUriPermission(tree, grantFlags);
                Uri old = library.getTreeUri();
                library.setTree(tree);
                // Only the successfully validated selection replaces the previous permission.
                if (old != null && !old.equals(tree) && !library.usesTree(old)) {
                    try { getContentResolver().releasePersistableUriPermission(old, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
                    catch (SecurityException ignored) { }
                }
                runOnUiThread(() -> {
                    if (destroyed) return;
                    folderBusy = false;
                    folder.setEnabled(true);
                    updateStatus();
                    progress.setIndeterminate(false);
                    // A fragment-only navigation would keep the previously empty catalog.
                    // Change the document URL so folder selection always reloads its records.
                    if (web != null) web.loadUrl(appOrigin + "/index.html?library=" + System.currentTimeMillis() + "#/series");
                    Toast.makeText(this, "Biblioteca conectada: " + count + " títulos.", Toast.LENGTH_LONG).show();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (destroyed) return;
                    folderBusy = false;
                    folder.setEnabled(true);
                    progress.setVisibility(View.GONE);
                    updateStatus();
                    new AlertDialog.Builder(this).setTitle("No se pudo conectar esta carpeta")
                        .setMessage("Selecciona la carpeta Netflix exportada, con data/library/catalog.json. Comprueba que todos los archivos terminaron de copiarse al teléfono. Tu biblioteca anterior se conserva.")
                        .setPositiveButton("Elegir otra carpeta", (dialog, which) -> chooseFolder())
                        .setNegativeButton("Cerrar", null).show();
                });
            }
        });
    }

    private void exitFullScreen() {
        if (fullScreenView == null) return;
        root.removeView(fullScreenView);
        fullScreenView = null;
        WebChromeClient.CustomViewCallback callback = fullScreenCallback;
        fullScreenCallback = null;
        normal.setVisibility(View.VISIBLE);
        root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root.requestApplyInsets();
        if (callback != null) callback.onCustomViewHidden();
    }

    @Override public void onBackPressed() {
        if (fullScreenView != null) { exitFullScreen(); return; }
        if (web != null && web.canGoBack()) { web.goBack(); return; }
        super.onBackPressed();
    }

    @Override protected void onPause() {
        if (wifiSync != null) wifiSync.pauseMonitoring();
        if (web != null) {
            web.evaluateJavascript("document.querySelectorAll('video,audio').forEach(function(media){media.pause();})", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        if (wifiSync != null) wifiSync.resumeMonitoring();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        if (wifiSync != null) wifiSync.close();
        exitFullScreen();
        if (web != null) {
            web.stopLoading();
            normal.removeView(web);
            web.destroy();
            web = null;
        }
        if (server != null) server.close();
        work.shutdownNow();
        super.onDestroy();
    }
}
