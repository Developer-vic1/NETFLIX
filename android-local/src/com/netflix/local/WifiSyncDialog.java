package com.netflix.local;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.InputFilter;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.CheckBox;
import android.widget.ScrollView;
import android.view.Gravity;
import java.util.Map;
import android.widget.Toast;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Native pairing and foreground downloads: the page never receives network tokens. */
public final class WifiSyncDialog implements AutoCloseable {
    private final Activity activity;
    private final LibraryAccess library;
    private final Runnable refresh;
    private final java.util.function.Consumer<Boolean> onBusy;
    public interface StateListener { void onState(String state, String title, String detail); }
    private final StateListener stateListener;
    private final ScheduledExecutorService monitor = Executors.newSingleThreadScheduledExecutor();
    private volatile WifiLibrarySync.Session activeSession;
    private volatile WifiLibrarySync checker;
    private volatile boolean online;
    private volatile boolean monitoring = true;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private WifiLibrarySync transfer;
    private AlertDialog dialog;
    private TextView message;
    private TextView counters;
    private ProgressBar progress;
    private volatile boolean closed;
    private volatile boolean cancelled;
    private volatile boolean busy;
    private long started;
    private long lastUpdate;
    private final Object operationLock = new Object();

    public WifiSyncDialog(Activity activity, LibraryAccess library, Runnable refresh, java.util.function.Consumer<Boolean> onBusy, StateListener stateListener) {
        this.activity = activity;
        this.library = library;
        this.refresh = refresh;
        this.onBusy = onBusy;
        this.stateListener = stateListener;
        monitor.scheduleWithFixedDelay(this::checkStatus, 8, 8, TimeUnit.SECONDS);
    }

    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private LinearLayout layout() {
        LinearLayout view = new LinearLayout(activity);
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(24), dp(12), dp(24), dp(12));
        return view;
    }
    private TextView text(String value) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextSize(14);
        view.setTextColor(0xffeeeeee);
        view.setPadding(0, dp(8), 0, dp(8));
        return view;
    }
    private void ui(Runnable action) { activity.runOnUiThread(() -> { if (!closed && !activity.isFinishing()) action.run(); }); }

    public void show() {
        if (closed) return;
        if (busy) {
            if (dialog != null) dialog.show();
            return;
        }
        if (activeSession != null && online) {
            refreshTitles();
            return;
        }
        LinearLayout view = layout();
        view.addView(text("En la computadora abre Compartir-WiFi.bat. Conecta ambos equipos a la misma red y escribe la dirección y el código que aparecen allí."));
        view.addView(text("Dirección de la computadora"));
        EditText address = new EditText(activity);
        address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setHint("http://192.168.1.20:4184");
        address.setText(activity.getPreferences(0).getString("wifi-address", ""));
        view.addView(address);
        view.addView(text("Código de vinculación"));
        EditText code = new EditText(activity);
        code.setSingleLine(true);
        code.setInputType(InputType.TYPE_CLASS_NUMBER);
        code.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});
        code.setHint("6 dígitos");
        view.addView(code);
        dialog = new AlertDialog.Builder(activity).setTitle("Añadir desde tu computadora")
            .setView(view).setPositiveButton("Conectar", null).setNegativeButton("Ahora no", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String url = address.getText().toString().trim();
            String pin = code.getText().toString().trim();
            if (url.isEmpty()) { address.setError("Escribe la dirección que muestra el archivo BAT."); address.requestFocus(); return; }
            if (!pin.matches("[0-9]{6}")) { code.setError("Introduce los seis dígitos del código."); code.requestFocus(); return; }
            dialog.dismiss();
            pair(url, pin);
        }));
        dialog.show();
    }

    public void connectDirect(String address, String code) {
        if (closed || busy) return;
        try {
            String normalized = WifiLibrarySync.validateAddress(address);
            if (code == null || !code.matches("[0-9]{6}")) throw new java.io.IOException("El código QR no contiene una vinculación válida.");
            if (dialog != null) dialog.dismiss();
            pair(normalized, code);
        } catch (java.io.IOException invalid) {
            new AlertDialog.Builder(activity).setTitle("No se pudo leer la conexión")
                .setMessage(invalid.getMessage()).setPositiveButton("Conectar manualmente", (d, which) -> show())
                .setNegativeButton("Cerrar", null).show();
        }
    }

    private void pair(String address, String code) {
        transfer = new WifiLibrarySync(activity.getApplicationContext(), library);
        cancelled = false;
        busy = true;
        stateListener.onState("connecting", "Conectando con tu computadora", "Comprobando la dirección y el código de esta sesión");
        showProgress("Conectando con la computadora…");
        worker.execute(() -> {
            try {
                synchronized (operationLock) {
                    if (cancelled) throw new java.io.IOException("Conexión cancelada.");
                }
                WifiLibrarySync.Session session = transfer.pairAndList(address, code);
                ui(() -> {
                    finishProgress();
                    activity.getPreferences(0).edit().putString("wifi-address", session.address).apply();
                    activeSession = session;
                    online = true;
                    connectedState(session);
                    chooseTitles(session);
                });
            } catch (Exception error) { failure(error); }
        });
    }

    private void refreshTitles() {
        final WifiLibrarySync.Session previous = activeSession;
        if (previous == null) return;
        cancelled = false;
        busy = true;
        transfer = new WifiLibrarySync(activity.getApplicationContext(), library);
        showProgress("Buscando los nuevos títulos de la computadora…");
        worker.execute(() -> {
            try {
                if (cancelled) throw new java.io.IOException("Consulta cancelada.");
                WifiLibrarySync.Session refreshed = transfer.refresh(previous);
                ui(() -> {
                    finishProgress();
                    activeSession = refreshed;
                    online = true;
                    connectedState(refreshed);
                    chooseTitles(refreshed);
                });
            } catch (Exception error) { failure(error); }
        });
    }

    private void connectedState(WifiLibrarySync.Session session) {
        stateListener.onState("connected", "Computadora conectada", session.records.length() +
            " títulos disponibles · " + android.net.Uri.parse(session.address).getHost());
    }

    private void checkStatus() {
        WifiLibrarySync.Session session = activeSession;
        if (closed || !monitoring || busy || session == null) return;
        try {
            checker = new WifiLibrarySync(activity.getApplicationContext(), library);
            checker.checkConnection(session);
            ui(() -> {
                if (activeSession != session || busy) return;
                online = true;
                connectedState(session);
            });
        } catch (Exception unavailable) {
            ui(() -> {
                if (activeSession != session || busy) return;
                online = false;
                stateListener.onState("offline", "Computadora sin conexión", "Tus videos locales siguen disponibles · vuelve a conectar para añadir títulos");
            });
        } finally { checker = null; }
    }

    public void pauseMonitoring() { monitoring = false; }
    public void resumeMonitoring() {
        monitoring = true;
        if (!closed) monitor.execute(this::checkStatus);
    }

    private void chooseTitles(WifiLibrarySync.Session session) {
        busy = true;
        cancelled = false;
        final WifiLibrarySync eligibility = new WifiLibrarySync(activity.getApplicationContext(), library);
        transfer = eligibility;
        showProgress("Comprobando qué títulos ya están guardados…");
        worker.execute(() -> {
            try {
                if (cancelled) throw new java.io.IOException("Consulta cancelada.");
                Map<String, WifiLibrarySync.Availability> available = eligibility.availableDownloads(session);
                if (cancelled) throw new java.io.IOException("Consulta cancelada.");
                ui(() -> {
                    finishProgress();
                    connectedState(session);
                    showTitles(session, available);
                });
            } catch (Exception error) { failure(error); }
        });
    }

    private void showTitles(WifiLibrarySync.Session session, Map<String, WifiLibrarySync.Availability> available) {
        int count = session.records.length();
        if (count == 0) {
            new AlertDialog.Builder(activity).setTitle("Todavía no hay títulos publicados")
                .setMessage("Añade y publica una película o serie en el administrador de la computadora. Después vuelve a conectar.")
                .setPositiveButton("Entendido", null).show();
            return;
        }
        String[] labels = new String[count];
        String[] ids = new String[count];
        for (int i = 0; i < count; i++) {
            JSONObject record = session.records.optJSONObject(i);
            JSONObject metadata = record.optJSONObject("metadata");
            ids[i] = record.optString("id");
            labels[i] = metadata == null ? "Título" : metadata.optString("name", "Título");
            if ("series".equals(record.optString("kind")) && record.optJSONArray("episodes") != null)
                labels[i] += " · " + record.optJSONArray("episodes").length() + " capítulos";
        }
        Set<String> selected = new LinkedHashSet<>();
        LinearLayout view = layout();
        long pendingCount = available.values().stream().filter(item -> !item.complete).count();
        view.addView(text(pendingCount == 0 ? "Todo está guardado. Publica nuevos videos en la computadora y vuelve a Ver títulos." :
            pendingCount + " títulos con videos nuevos. Los que ya tienes guardados no se pueden seleccionar."));
        ScrollView scroll = new ScrollView(activity);
        LinearLayout rows = new LinearLayout(activity);
        rows.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(rows);
        int maxHeight = (int) (activity.getResources().getDisplayMetrics().heightPixels * .45);
        for (int i = 0; i < count; i++) {
            final String id = ids[i];
            WifiLibrarySync.Availability item = available.get(id);
            if (item == null) continue;
            LinearLayout row = new LinearLayout(activity);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, dp(6), 0, dp(6));
            CheckBox check = new CheckBox(activity);
            check.setEnabled(!item.complete);
            check.setContentDescription(labels[i] + (item.complete ? " · Ya guardado" : " · Seleccionar para descargar"));
            row.addView(check, new LinearLayout.LayoutParams(dp(44), dp(48)));
            LinearLayout copy = new LinearLayout(activity);
            copy.setOrientation(LinearLayout.VERTICAL);
            TextView title = text(labels[i]);
            title.setPadding(0, 0, 0, dp(2));
            TextView hint = text(item.complete ? "Ya guardado · Disponible sin conexión" :
                (item.newEpisodes > 0 ? item.newEpisodes + " capítulos nuevos · " : "Nuevo video · ") +
                String.format(Locale.getDefault(), "%.2f GiB por recibir", item.pendingBytes / 1073741824.0));
            hint.setTextSize(12);
            hint.setTextColor(item.complete ? 0xff74d5a9 : 0xffbec1c9);
            hint.setPadding(0, 0, 0, 0);
            copy.addView(title);
            copy.addView(hint);
            row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
            row.setAlpha(item.complete ? .65f : 1f);
            row.setEnabled(!item.complete);
            if (!item.complete) row.setOnClickListener(v -> check.setChecked(!check.isChecked()));
            check.setOnCheckedChangeListener((button, checked) -> {
                if (item.complete) return;
                if (checked) selected.add(id); else selected.remove(id);
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!selected.isEmpty());
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setText("Descargar (" + selected.size() + ")");
            });
            rows.addView(row);
        }
        view.addView(scroll, new LinearLayout.LayoutParams(-1, Math.min(maxHeight, count * dp(76))));
        dialog = new AlertDialog.Builder(activity).setTitle("Nuevos videos para tu teléfono")
            .setView(view)
            .setPositiveButton("Descargar", (d, which) -> download(session, selected))
            .setNegativeButton("Cancelar", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false));
        dialog.show();
    }

    private void download(WifiLibrarySync.Session session, Set<String> ids) {
        cancelled = false;
        busy = true;
        transfer = new WifiLibrarySync(activity.getApplicationContext(), library);
        stateListener.onState("syncing", "Guardando en tu teléfono", "Comprobando y recibiendo los títulos seleccionados");
        started = android.os.SystemClock.elapsedRealtime();
        lastUpdate = 0;
        showProgress("Preparando y comprobando los archivos…");
        worker.execute(() -> {
            try {
                synchronized (operationLock) {
                    if (cancelled) throw new java.io.IOException("Transferencia cancelada.");
                }
                int count = transfer.sync(session, new LinkedHashSet<>(ids), (done, total, status) -> {
                    long now = android.os.SystemClock.elapsedRealtime();
                    if (now - lastUpdate < 200 && done != total) return;
                    lastUpdate = now;
                    ui(() -> update(done, total, status));
                });
                ui(() -> {
                    finishProgress();
                    connectedState(session);
                    refresh.run();
                    new AlertDialog.Builder(activity).setTitle("Tu biblioteca está lista")
                        .setMessage(count + " títulos comprobados. Puedes cerrar la computadora y verlos sin conexión. Los videos existentes se reutilizan cuando coinciden.")
                        .setPositiveButton("Ver biblioteca", null).show();
                });
            } catch (Exception error) { failure(error); }
        });
    }

    private void showProgress(String initial) {
        onBusy.accept(true);
        LinearLayout view = layout();
        message = text(initial);
        message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        view.addView(message);
        progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(1000);
        progress.setIndeterminate(true);
        view.addView(progress, new LinearLayout.LayoutParams(-1, dp(12)));
        counters = text("Los archivos se guardan y verifican antes de aparecer en tu biblioteca.");
        view.addView(counters);
        view.addView(text("Mantén esta pantalla abierta durante la descarga. Puedes cancelarla y volver a intentarlo."));
        dialog = new AlertDialog.Builder(activity).setTitle("Preparando tu biblioteca")
            .setView(view).setNegativeButton("Cancelar transferencia", (d, which) -> {
                synchronized (operationLock) {
                    cancelled = true;
                    if (transfer != null) transfer.cancel();
                }
            }).create();
        dialog.setCancelable(false);
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        dialog.show();
    }

    private void update(long done, long total, String status) {
        message.setText(status);
        if (total <= 0) { progress.setIndeterminate(true); return; }
        progress.setIndeterminate(false);
        progress.setProgress((int) Math.min(1000, done * 1000.0 / total));
        double seconds = Math.max(1, (android.os.SystemClock.elapsedRealtime() - started) / 1000.0);
        counters.setText(String.format(Locale.getDefault(), "%.1f%% · %.2f / %.2f GiB comprobados o guardados\nTiempo transcurrido: %d min %02d s",
            done * 100.0 / total, done / 1073741824.0, total / 1073741824.0,
            (long) seconds / 60, (long) seconds % 60));
    }

    private void finishProgress() {
        busy = false;
        onBusy.accept(false);
        if (dialog != null) dialog.dismiss();
        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    private void failure(Exception error) {
        android.util.Log.w("NetflixWifi", "Connection/transfer failed", error);
        ui(() -> {
            finishProgress();
            online = false;
            stateListener.onState(cancelled ? "offline" : "error", cancelled ? "Transferencia detenida" : "No se pudo conectar",
                "La biblioteca local se conserva · pulsa Conectar para volver a intentarlo");
            if (cancelled) {
                Toast.makeText(activity, "Transferencia detenida. La biblioteca anterior se conserva.", Toast.LENGTH_LONG).show();
                return;
            }
            String detail = error.getMessage();
            if (error instanceof java.net.SocketTimeoutException || error instanceof java.net.ConnectException)
                detail = "La computadora no respondió. Comprueba que Compartir-WiFi.bat esté abierto, que Windows haya autorizado la red privada y que ambos equipos estén conectados al mismo router.";
            if (detail == null || detail.startsWith("java.") || detail.startsWith("http"))
                detail = "No se pudo completar la conexión. Revisa la misma Wi-Fi, la dirección y el código, y vuelve a intentarlo.";
            new AlertDialog.Builder(activity).setTitle("No se pudo completar la transferencia")
                .setMessage(detail + "\n\nTus títulos anteriores se conservan.")
                .setPositiveButton("Reintentar", (d, which) -> show()).setNegativeButton("Cerrar", null).show();
        });
    }
    @Override public void close() {
        closed = true;
        if (transfer != null) transfer.cancel();
        if (checker != null) checker.cancel();
        monitor.shutdownNow();
        worker.shutdownNow();
        if (dialog != null) dialog.dismiss();
    }
}
