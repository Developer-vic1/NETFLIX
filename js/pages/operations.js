import { el, button, field, select } from "../utils/dom.js";
import { t, getLocalization } from "../services/localization.service.js";
import { activeProfile } from "../services/profile.service.js";
import { telemetry } from "../services/session-telemetry.service.js";
import { eventBus } from "../services/event-bus.service.js";
import {
  operationsSnapshot,
  subscribeOperations,
} from "../services/operations-store.service.js";
import { checkLocalServices } from "../services/health.service.js";
import { summarizeSessions, percentile, mean } from "../utils/statistics.js";
import { milliseconds, seconds, number, dateTime } from "../utils/format.js";
import { downloadFile, toCsv } from "../utils/export.js";
import { REGIONS, regionName } from "../config/regions.js";
import { titles } from "../data/titles.js";
import { regionalMap } from "../components/map.js";
import { opsChart } from "../components/ops-chart.js";
import { sessionsPanel } from "../components/ops-sessions.js";
import { incidentsPanel } from "../components/ops-incidents.js";
import { toast } from "../components/toast.js";
import { icon } from "../utils/icons.js";
import { changeView, motionReduced } from "../services/motion.service.js";
import { metricAnimator } from "../components/animated-metric.js";
import { operationsWorkspace } from "../components/operations-workspace.js";
import { activityInfo } from "../utils/activity.js";
import { filmLibrary } from "../components/film-library.js";
export function renderOperations({ root, navigate }) {
  if (activeProfile().role !== "admin") {
    root.append(
      el("div", { class: "container page" }, [
        el("h1", { class: "page-title", text: t("operations.title") }),
        el("section", { class: "panel" }, [
          el("p", { text: t("admin.access") }),
          button(
            t("profiles.switch"),
            () => navigate("profiles"),
            "button button-primary",
          ),
        ]),
      ]),
    );
    return;
  }
  let disposed = false,
    healthRunning = false;
  const controller = new AbortController(),
    values = new Map(),
    panels = new Map(),
    navButtons = new Map();
  const animateMetrics = metricAnimator();
  const region = select(
    [
      ["all", t("ops.allRegions")],
      ...REGIONS.map((item) => [
        item.code,
        regionName(item.code, getLocalization().language),
      ]),
    ],
    "all",
    { id: "ops-region" },
  );
  const period = select(
    [
      ["all", t("ops.allTime")],
      ["today", t("ops.today")],
      ["hour", t("ops.lastHour")],
    ],
    "all",
    { id: "ops-period" },
  );
  const titleFilter = select(
    [
      ["all", t("ops.allTitles")],
      ...titles.map((title) => [title.id, title.name]),
    ],
    "all",
    { id: "ops-title" },
  );
  const selected = (item) =>
    (region.value === "all" || item.region === region.value) &&
    (titleFilter.value === "all" ||
      !item.titleId ||
      item.titleId === titleFilter.value) &&
    (period.value === "all" ||
      Date.now() -
        Date.parse(
          item.startedAt || item.createdAt || item.time || item.timestamp,
        ) <
        (period.value === "hour" ? 3600000 : 86400000));
  const filteredSessions = () => operationsSnapshot().sessions.filter(selected);
  const filteredProbes = () => operationsSnapshot().probes.filter(selected);
  const measure = () => {
    if (
      !disposed &&
      telemetry.snapshot.probe.state !== "loading" &&
      navigator.onLine
    )
      void telemetry.measureCatalog(controller.signal);
  };
  const auto = el("input", {
    type: "checkbox",
    id: "admin-auto",
    checked: true,
  });
  const exportReport = () => {
    downloadFile(
      "streaming-quality.json",
      JSON.stringify(
        {
          scope: "THIS_BROWSER",
          generatedAt: new Date().toISOString(),
          selectedRegion: getLocalization().region,
          filters: {
            region: region.value,
            period: period.value,
            title: titleFilter.value,
          },
          telemetry: telemetry.snapshot,
          history: {
            ...operationsSnapshot(),
            sessions: filteredSessions(),
            probes: filteredProbes(),
          },
          events: eventBus.history,
        },
        null,
        2,
      ),
    );
    toast(t("admin.exported"), "success");
  };
  const page = el("div", { class: "ops-workspace" });
  const liveText = el("span", {
    text: t(navigator.onLine ? "ops.live" : "state.offline"),
  });
  const side = el("aside", { class: "ops-sidebar" }, [
    el("div", { class: "ops-identity" }, [
      el("img", {
        class: "ops-n",
        src: "assets/icons/netflix-n.svg",
        width: 32,
        height: 44,
        alt: "",
        "aria-hidden": "true",
      }),
      el("div", {}, [
        el("strong", { text: t("ops.controlRoom") }),
        el("small", { text: t("ops.scope") }),
      ]),
    ]),
  ]);
  const navigation = el("nav", {
    class: "ops-navigation",
    "aria-label": t("operations.title"),
  });
  const tabs = [
    ["overview", "ops.overview", "monitor"],
    ["sessions", "ops.sessions", "play"],
    ["incidents", "ops.incidents", "bell"],
    ["services", "admin.integrations", "settings"],
    ["library", "library.title", "film"],
    ["events", "operations.events", "info"],
  ];
  const main = el("div", { class: "ops-main" });
  let activeTab = "overview";
  const showTab = (tab, animate = true) => {
    if (animate && activeTab === tab) return;
    activeTab = tab;
    const update = () => {
      if (disposed) return;
      for (const [key, panel] of panels) panel.hidden = key !== tab;
      for (const [key, node] of navButtons)
        node.setAttribute("aria-current", key === tab ? "page" : "false");
      main.dataset.tab = tab;
      main.querySelector(".ops-filterbar").hidden = [
        "services",
        "library",
      ].includes(tab);
      sectionStatus.textContent = t(tabs.find(([key]) => key === tab)[1]);
      window.dispatchEvent(new Event("resize"));
      eventBus.emit("OPERATIONS_SECTION_OPENED", tab);
    };
    if (animate) changeView(update, { cinematic: true });
    else update();
  };
  for (const [key, label, symbol] of tabs) {
    const node = button(
      [icon(symbol), el("span", { text: t(label) })],
      () => showTab(key),
      "ops-nav-button",
      { "data-ops-tab": key },
    );
    navButtons.set(key, node);
    node.style.setProperty("--nav-index", navButtons.size - 1);
    navigation.append(node);
  }
  const alertCount = el("span", {
    class: "ops-alert-count",
    hidden: true,
    "aria-hidden": "true",
  });
  navButtons.get("incidents").append(alertCount);
  const sectionStatus = el("p", {
    class: "sr-only",
    role: "status",
    "aria-live": "polite",
  });
  main.append(sectionStatus);
  side.append(
    navigation,
    el("div", { class: "ops-side-foot" }, [
      el("span", { class: "ops-live" }, [
        el("span", { class: "dot" }),
        liveText,
      ]),
      el("p", { text: t("ops.historyNote") }),
      button(t("profiles.switch"), () => navigate("profiles"), "text-link"),
    ]),
  );
  main.append(
    el("div", { class: "ops-topline" }, [
      el("span", { class: "eyebrow", text: t("ops.workspace") }),
      el("span", { class: "ops-scope-pill", text: t("ops.scope") }),
    ]),
    el("div", { class: "page-header" }, [
      el("div", {}, [
        el("h1", { class: "page-title", text: t("operations.title") }),
        el("p", { class: "muted", text: t("admin.subtitle") }),
      ]),
      el("div", { class: "ops-header-actions" }, [
        button(
          [icon("download"), t("admin.export")],
          exportReport,
          "button button-ghost",
        ),
      ]),
    ]),
    el("div", { class: "ops-filterbar" }, [
      field(t("settings.region"), region),
      field(t("ops.period"), period),
      field(t("ops.titleFilter"), titleFilter),
    ]),
  );
  for (const [key] of tabs) {
    const panel = el("section", {
      class: "ops-tab-panel",
      hidden: key !== "overview",
      "data-ops-panel": key,
    });
    panels.set(key, panel);
    main.append(panel);
  }
  page.append(side, main);
  root.append(page);
  const overview = panels.get("overview");
  const metric = (key, unitKey) => {
    const value = el("p", { class: "metric-value", text: "—" });
    values.set(key, value);
    return el("section", { class: "ops-panel metric-card" }, [
      el("span", { class: "metric-label", text: t(key) }),
      value,
      el("small", { class: "muted", text: t(unitKey) }),
    ]);
  };
  overview.append(
    el(
      "div",
      { class: "ops-metrics" },
      [
        ["operations.latency", "ops.latestHttp"],
        ["ops.startupP95", "ops.startupDescription"],
        ["admin.buffering", "ops.observedSessions"],
        ["admin.dropped", "ops.observedFrames"],
        ["ops.sessionCount", "ops.historyNote"],
        ["ops.watched", "ops.observedTime"],
      ].map(([key, hint]) => metric(key, hint)),
    ),
  );
  const chartPanel = el("section", { class: "ops-panel" }, [
    el("div", { class: "section-header" }, [
      el("h2", { text: t("operations.charts") }),
      el("span", { class: "status-pill status-healthy", text: "HTTP" }),
    ]),
    el("p", { class: "muted", text: t("admin.measurement") }),
  ]);
  const comparison = el("p", { class: "notice", role: "status" });
  const probeButton = button(
    t("admin.measure"),
    measure,
    "button button-primary",
  );
  chartPanel.append(
    el("div", { class: "panel-actions" }, [
      probeButton,
      el("label", { class: "check-field", for: "admin-auto" }, [
        auto,
        t("admin.auto"),
      ]),
    ]),
    comparison,
  );
  const httpChart = opsChart(chartPanel, "operations.chartLabel");
  const mapPanel = el("section", { class: "ops-panel ops-map-panel" }, [
    el("h2", { text: t("operations.map") }),
    el("p", { class: "muted", text: t("admin.mapScope") }),
  ]);
  overview.append(
    el("div", { class: "ops-chart-grid" }, [chartPanel, mapPanel]),
  );
  const destroyMap = regionalMap(mapPanel);
  const startupPanel = el("section", { class: "ops-panel" }, [
    el("h2", { text: t("ops.startupHistory") }),
    el("p", { class: "muted", text: t("ops.startupDescription") }),
  ]);
  const startupChart = opsChart(startupPanel, "ops.startupHistory");
  const quality = el("div", { class: "quality-summary" }),
    regionalList = el("div", { class: "regional-observations" });
  overview.append(
    el("div", { class: "ops-chart-grid" }, [
      startupPanel,
      el("section", { class: "ops-panel" }, [
        el("h2", { text: t("ops.quality") }),
        quality,
        regionalList,
      ]),
    ]),
  );
  const storageWarning = el("p", {
    class: "notice",
    hidden: true,
    "data-tone": "warning",
    text: t("ops.storageWarning"),
  });
  overview.append(storageWarning);
  const sessionPanel = panels.get("sessions");
  sessionPanel.classList.add("ops-panel");
  const sessionView = sessionsPanel(sessionPanel, navigate, filteredSessions);
  sessionPanel.append(
    el(
      "div",
      { class: "panel-actions" },
      button(
        t("ops.exportCsv"),
        () =>
          downloadFile(
            "playback-sessions.csv",
            toCsv(filteredSessions(), [
              "startedAt",
              "title",
              "profileName",
              "region",
              "quality",
              "state",
              "startupMs",
              "playedSeconds",
              "bufferingEvents",
              "bufferingMs",
              "totalFrames",
              "droppedFrames",
              "offline",
            ]),
            "text/csv;charset=utf-8",
          ),
        "button button-ghost",
      ),
    ),
  );
  const incidentPanel = panels.get("incidents");
  incidentPanel.classList.add("ops-panel");
  const incidentView = incidentsPanel(incidentPanel, navigate, () =>
    operationsSnapshot().incidents.filter(selected),
  );
  const servicePanel = panels.get("services");
  servicePanel.classList.add("ops-panel");
  const serviceResults = el("div", { class: "service-health-grid" }),
    healthStatus = el("p", { role: "status", class: "muted" });
  const healthButton = button(
    t("ops.runChecks"),
    async () => {
      if (healthRunning) return;
      healthRunning = true;
      healthButton.disabled = true;
      serviceResults.replaceChildren();
      healthStatus.textContent = t("ops.checking");
      try {
        await checkLocalServices(controller.signal, (item) => {
          if (!disposed)
            serviceResults.append(
              el(
                "article",
                { class: `health-result ${item.ok ? "healthy" : "critical"}` },
                [
                  el("strong", { text: t(`ops.service.${item.id}`) }),
                  el("span", {
                    class: "status-pill",
                    text: t(item.ok ? "ops.verified" : "ops.failed"),
                  }),
                  el("p", { class: "muted", text: item.detail }),
                  el("small", { text: milliseconds(item.ms) }),
                ],
              ),
            );
        });
        if (!disposed) healthStatus.textContent = t("ops.checkFinished");
      } catch {
        if (!disposed) healthStatus.textContent = t("ops.failed");
      } finally {
        healthRunning = false;
        if (!disposed) healthButton.disabled = false;
      }
    },
    "button button-primary",
  );
  servicePanel.append(
    el("h2", { text: t("admin.integrations") }),
    el("p", { class: "muted", text: t("ops.checkScope") }),
    el("div", { class: "panel-actions" }, healthButton),
    healthStatus,
    serviceResults,
  );
  const workspace = operationsWorkspace();
  servicePanel.append(workspace);
  const library = filmLibrary(navigate);
  panels.get("library").classList.add("ops-panel");
  panels.get("library").append(library.root);
  const eventPanel = panels.get("events");
  eventPanel.classList.add("ops-panel");
  const search = el("input", {
    type: "search",
    id: "event-search",
    placeholder: t("ops.searchEvents"),
  });
  const category = select(
    ["all", "playback", "downloads", "account", "system"].map((key) => [
      key,
      t(`activity.${key}`),
    ]),
    "all",
    { id: "event-category" },
  );
  const count = el("p", { class: "muted activity-count", role: "status" });
  const eventList = el("ol", {
    class: "activity-list",
    "aria-label": t("operations.events"),
  });
  eventPanel.append(
    el("h2", { text: t("operations.events") }),
    el("p", { class: "muted", text: t("activity.help") }),
    el("div", { class: "activity-toolbar" }, [
      field(t("nav.search"), search),
      field(t("activity.filter"), category),
    ]),
    count,
    eventList,
  );
  const drawEvents = () => {
    const expanded = new Set(
      [...eventList.querySelectorAll("details[open]")].map(
        (node) => node.dataset.eventId,
      ),
    );
    const query = search.value.trim().toLowerCase();
    const rows = operationsSnapshot()
      .events.filter(selected)
      .filter((item) => {
        const info = activityInfo(item);
        return (
          (category.value === "all" || info.group === category.value) &&
          `${info.label} ${info.context} ${item.name} ${item.details}`
            .toLowerCase()
            .includes(query)
        );
      })
      .reverse();
    count.textContent = `${rows.length} · ${t("activity.results")}`;
    eventList.replaceChildren(
      ...rows.map((item) =>
        el(
          "li",
          {
            class: `activity-row${activityInfo(item).warning ? " activity-warning" : ""}`,
          },
          [
            el(
              "span",
              { class: "activity-symbol", "aria-hidden": "true" },
              icon(
                activityInfo(item).group === "playback"
                  ? "play"
                  : activityInfo(item).group === "downloads"
                    ? "download"
                    : "info",
              ),
            ),
            el("div", { class: "activity-content" }, [
              el("strong", { text: activityInfo(item).label }),
              el("p", { text: activityInfo(item).context }),
              el(
                "details",
                {
                  class: "activity-details",
                  "data-event-id": item.id,
                  ...(expanded.has(item.id) ? { open: true } : {}),
                },
                [
                  el("summary", { text: t("activity.technical") }),
                  el("code", { text: `${item.name}\n${item.details}` }),
                ],
              ),
            ]),
            el("time", {
              datetime: item.timestamp,
              text: dateTime(item.timestamp),
            }),
          ],
        ),
      ),
    );
    if (!rows.length)
      eventList.append(
        el("li", { class: "activity-empty", text: t("activity.empty") }),
      );
  };
  search.addEventListener("input", drawEvents);
  category.addEventListener("change", drawEvents);
  const draw = () => {
    if (disposed) return;
    const snapshot = operationsSnapshot(),
      sessions = filteredSessions(),
      probes = filteredProbes().filter((item) => item.success),
      summary = summarizeSessions(sessions),
      data = telemetry.snapshot;
    animateMetrics.update(
      values.get("operations.latency"),
      probes.at(-1)?.latency,
      milliseconds,
    );
    animateMetrics.update(
      values.get("ops.startupP95"),
      summary.startupP95,
      milliseconds,
    );
    animateMetrics.update(
      values.get("admin.buffering"),
      summary.bufferingEvents,
      (value) => number(value, 0),
    );
    animateMetrics.update(
      values.get("admin.dropped"),
      summary.droppedPercent,
      (value) => (Number.isFinite(value) ? `${number(value, 2)}%` : "—"),
    );
    animateMetrics.update(
      values.get("ops.sessionCount"),
      summary.count,
      (value) => number(value, 0),
    );
    animateMetrics.update(
      values.get("ops.watched"),
      summary.playedSeconds,
      seconds,
    );
    const unresolved = snapshot.incidents.filter(
      (item) => item.status !== "resolved",
    ).length;
    navButtons
      .get("incidents")
      .setAttribute(
        "aria-label",
        `${t("ops.incidents")} · ${unresolved} ${t("ops.openAlerts")}`,
      );
    if (Number(alertCount.textContent) !== unresolved) {
      alertCount.textContent = String(unresolved);
      alertCount.hidden = unresolved === 0;
      if (!motionReduced() && unresolved > 0)
        alertCount.animate(
          [
            { transform: "scale(.6)" },
            { transform: "scale(1.15)" },
            { transform: "scale(1)" },
          ],
          { duration: 320, easing: "ease-out" },
        );
    }
    probeButton.disabled = data.probe.state === "loading" || !navigator.onLine;
    probeButton.classList.toggle(
      "is-measuring",
      data.probe.state === "loading",
    );
    probeButton.setAttribute(
      "aria-busy",
      String(data.probe.state === "loading"),
    );
    liveText.textContent = t(navigator.onLine ? "ops.live" : "state.offline");
    httpChart.update(
      probes.map((item) => ({
        label: new Date(item.time).toLocaleTimeString(),
        value: item.latency,
      })),
    );
    startupChart.update(
      sessions
        .filter((item) => Number.isFinite(item.startupMs))
        .map((item) => ({ label: item.title, value: item.startupMs })),
    );
    const points = probes.map((item) => item.latency);
    comparison.textContent =
      points.length >= 2
        ? t("admin.comparison", {
            difference: (points.at(-1) - points[0]).toFixed(1),
            first: points[0],
            latest: points.at(-1),
          })
        : t("admin.waitSamples");
    quality.replaceChildren(
      ...[
        ["ops.averageHttp", milliseconds(mean(points))],
        ["ops.p95Http", milliseconds(percentile(points))],
        ["ops.bufferTime", milliseconds(summary.bufferingMs)],
        ["ops.completed", number(summary.completed, 0)],
        ["ops.errors", number(summary.errors, 0)],
        [
          "ops.openAlerts",
          number(
            snapshot.incidents.filter((item) => item.status !== "resolved")
              .length,
            0,
          ),
        ],
      ].map(([key, value]) =>
        el("div", {}, [
          el("span", { class: "muted", text: t(key) }),
          el("strong", { text: value }),
        ]),
      ),
    );
    const observedRegions = [
      ...new Set([
        ...snapshot.sessions.map((item) => item.region),
        ...snapshot.probes.map((item) => item.region),
      ]),
    ];
    regionalList.replaceChildren(
      el("h3", { text: t("ops.regionalEvidence") }),
      ...observedRegions.map((code) => {
        const stats = summarizeSessions(
          snapshot.sessions.filter((item) => item.region === code),
        );
        return button(
          [
            el("span", { text: regionName(code, getLocalization().language) }),
            el("span", { text: `${stats.count} · ${stats.bufferingEvents}` }),
          ],
          () => {
            region.value = code;
            draw();
          },
          "region-observation",
          { "aria-label": `${regionName(code)} · ${t("ops.filter")}` },
        );
      }),
    );
    storageWarning.hidden = snapshot.writable;
    sessionView.update();
    incidentView.update();
    drawEvents();
  };
  for (const input of [region, period, titleFilter])
    input.addEventListener("change", draw);
  const unsubscribe = subscribeOperations(draw),
    unsubscribeTelemetry = telemetry.subscribe(draw);
  window.addEventListener("online", draw);
  window.addEventListener("offline", draw);
  draw();
  measure();
  const timer = setInterval(() => {
    if (auto.checked && activeTab === "overview" && !document.hidden) measure();
  }, 10000);
  showTab("overview", false);
  return () => {
    disposed = true;
    library.destroy();
    animateMetrics.destroy();
    controller.abort();
    clearInterval(timer);
    unsubscribe();
    unsubscribeTelemetry();
    httpChart.destroy();
    startupChart.destroy();
    destroyMap();
    window.removeEventListener("online", draw);
    window.removeEventListener("offline", draw);
  };
}
