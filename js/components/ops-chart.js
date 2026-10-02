import { el } from "../utils/dom.js";
import { THEME } from "../config/theme.js";
import { t } from "../services/localization.service.js";
export function opsChart(parent, labelKey, unit = "ms") {
  const colors = THEME.colors;
  const canvas = el("canvas", { role: "img", "aria-label": t(labelKey) });
  const summary = el("p", { class: "chart-summary" });
  parent.append(el("div", { class: "chart-frame" }, canvas), summary);
  if (!window.Chart) return { update() {}, destroy() {} };
  const chart = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: t(labelKey),
          data: [],
          borderColor: colors.primary,
          backgroundColor: colors.primary,
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (context) => `${context.parsed.y} ${unit}` },
        },
      },
      scales: {
        x: {
          ticks: { color: colors.text, maxTicksLimit: 6 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: colors.text },
          grid: { color: colors.border },
        },
      },
    },
  });
  return {
    update(points) {
      const valid = points
        .filter((point) => Number.isFinite(point.value))
        .slice(-60);
      chart.data.labels = valid.map((point) => point.label);
      chart.data.datasets[0].data = valid.map((point) => point.value);
      chart.update("none");
      summary.textContent = valid.length
        ? `${t(labelKey)}: ${valid.map((point) => `${point.value.toFixed(1)} ${unit}`).join(" · ")}`
        : t("ops.noSamples");
    },
    destroy() {
      chart.destroy();
    },
  };
}
