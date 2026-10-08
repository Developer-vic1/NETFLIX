package com.netflix.local;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Clear, live connection state, distinct from the on-device library's availability. */
public final class ConnectionBar extends LinearLayout {
    private final TextView heading;
    private final TextView detail;
    private final TextView libraryStatus;
    private final View light;
    private final Button wifi;
    private final Button folder;
    private final Button hide;
    private String state = "idle";

    public ConnectionBar(Context context) {
        super(context);
        setOrientation(VERTICAL);
        setPadding(dp(12), dp(8), dp(12), dp(8));
        setBackgroundColor(0xff101010);
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(VERTICAL);
        card.setPadding(dp(12), dp(10), dp(12), dp(8));
        card.setBackground(surface(0xff191a1d, 0xff33353b));
        addView(card, new LayoutParams(-1, -2));
        LinearLayout summary = new LinearLayout(context);
        summary.setGravity(Gravity.CENTER_VERTICAL);
        light = new View(context);
        LayoutParams dot = new LayoutParams(dp(9), dp(9));
        dot.setMargins(0, 0, dp(10), 0);
        summary.addView(light, dot);
        LinearLayout copy = new LinearLayout(context);
        copy.setOrientation(VERTICAL);
        heading = label(14, 0xfff5f5f5);
        heading.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        heading.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        detail = label(12, 0xffb4b7be);
        detail.setPadding(0, dp(3), 0, 0);
        copy.addView(heading);
        copy.addView(detail);
        summary.addView(copy, new LayoutParams(0, -2, 1));
        hide = action("Ocultar");
        hide.setContentDescription("Ocultar conexión; puedes verla otra vez desde Conexiones en el menú");
        summary.addView(hide, new LayoutParams(dp(70), dp(44)));
        card.addView(summary);
        LinearLayout actions = new LinearLayout(context);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        actions.setPadding(0, dp(8), 0, 0);
        libraryStatus = label(11, 0xffa8adb6);
        libraryStatus.setMaxLines(2);
        actions.addView(libraryStatus, new LayoutParams(0, -2, 1));
        folder = action("Carpeta");
        folder.setContentDescription("Abrir una biblioteca ya guardada en el teléfono");
        actions.addView(folder, new LayoutParams(dp(72), dp(44)));
        wifi = action("Conectar");
        wifi.setContentDescription("Conectar con la computadora o consultar sus títulos por Wi-Fi");
        LayoutParams wifiSize = new LayoutParams(dp(100), dp(44));
        wifiSize.setMargins(dp(6), 0, 0, 0);
        actions.addView(wifi, wifiSize);
        card.addView(actions);
        setConnection("idle", "Tu biblioteca en el teléfono", "Conecta por Wi-Fi para añadir nuevos títulos");
        libraryStatus.setText("Iniciando biblioteca…");
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private GradientDrawable surface(int color, int border) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(12));
        drawable.setStroke(dp(1), border);
        return drawable;
    }
    private TextView label(int size, int color) {
        TextView view = new TextView(getContext());
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        return view;
    }
    private Button action(String text) {
        Button button = new Button(getContext());
        button.setAllCaps(false);
        button.setText(text);
        button.setTextSize(12);
        button.setTextColor(0xffeeeeee);
        button.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        button.setPadding(dp(6), 0, dp(6), 0);
        button.setBackground(surface(0xff26282d, 0xff43464f));
        return button;
    }
    public TextView statusLabel() { return libraryStatus; }
    public Button folderButton() { return folder; }
    public Button wifiButton() { return wifi; }
    public Button hideButton() { return hide; }

    public void setConnection(String next, String title, String description) {
        if (state.equals(next) && title.contentEquals(heading.getText()) && description.contentEquals(detail.getText())) return;
        boolean changed = !state.equals(next);
        state = next;
        heading.setText(title);
        detail.setText(description);
        int color = "connected".equals(next) ? 0xff48d39b :
            "syncing".equals(next) || "connecting".equals(next) ? 0xffffbb54 :
            "error".equals(next) ? 0xfffa7279 : 0xff89909b;
        GradientDrawable indicator = new GradientDrawable();
        indicator.setShape(GradientDrawable.OVAL);
        indicator.setColor(color);
        light.setBackground(indicator);
        wifi.setText("connected".equals(next) ? "Ver títulos" : "connecting".equals(next) ? "Conectando" :
            "syncing".equals(next) ? "Guardando" : "Conectar");
        wifi.setBackground(surface("connected".equals(next) ? 0xff16352b : 0xffa50913,
            "connected".equals(next) ? 0xff347860 : 0xffde1823));
        if (changed && getResources().getConfiguration().fontScale < 1.8f) {
            summaryFade();
        }
    }
    private void summaryFade() {
        // One brief opacity transition per state change; no continuous looping or flicker.
        heading.animate().cancel();
        detail.animate().cancel();
        heading.setAlpha(.65f);
        detail.setAlpha(.65f);
        heading.animate().alpha(1).setDuration(180).start();
        detail.animate().alpha(1).setDuration(180).start();
    }
}
