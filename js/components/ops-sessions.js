import { el, button, field, select } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
import { operationsSnapshot } from "../services/operations-store.service.js";
import { regionName } from "../config/regions.js";
import { milliseconds, seconds, dateTime, number } from "../utils/format.js";
import { compareSessions } from "../utils/statistics.js";
import { openModal } from "./modal.js";
export function sessionDetails(session, navigate) {
  const facts = [
    ["ops.profile", session.profileName],
    ["settings.region", regionName(session.region)],
    ["ops.started", dateTime(session.startedAt)],
    ["player.quality", session.quality],
    ["ops.startup", milliseconds(session.startupMs)],
    ["ops.watched", seconds(session.playedSeconds)],
    ["ops.bufferTime", milliseconds(session.bufferingMs)],
    ["admin.buffering", session.bufferingEvents],
    ["admin.frames", `${session.totalFrames} / ${session.droppedFrames}`],
    ["admin.resolution", `${session.width} × ${session.height}`],
    ["admin.state", t(`media.${session.state}`)],
  ];
  openModal({
    title: session.title,
    content: [
      el(
        "div",
        { class: "session-facts" },
        facts.map(([key, value]) =>
          el("div", {}, [
            el("span", { class: "muted", text: t(key) }),
            el("strong", { text: value }),
          ]),
        ),
      ),
      button(
        t("ops.retest"),
        () => navigate(`player?title=${session.titleId}`),
        "button button-primary",
      ),
    ],
  });
}
export function sessionsPanel(parent, navigate, getFiltered) {
  const list = el("div", { class: "sessions-list" });
  const comparison = el("div", {
    class: "comparison-box",
    hidden: true,
    role: "status",
  });
  const first = select([], "", { id: "compare-first" }),
    second = select([], "", { id: "compare-second" });
  const compare = button(t("ops.compare"), () => {
    const sessions = operationsSnapshot().sessions;
    const a = sessions.find((item) => item.id === first.value),
      b = sessions.find((item) => item.id === second.value);
    if (!a || !b || a.id === b.id) {
      comparison.hidden = false;
      comparison.replaceChildren(el("p", { text: t("ops.chooseTwo") }));
      return;
    }
    const result = compareSessions(a, b);
    comparison.hidden = false;
    comparison.replaceChildren(
      el("p", {
        text: `${a.title} (${a.quality}) → ${b.title} (${b.quality})`,
      }),
      el("p", { class: "muted", text: t("ops.compareScope") }),
      el(
        "div",
        { class: "comparison-grid" },
        [
          ["ops.startup", milliseconds(result.startupMs)],
          ["ops.bufferTime", milliseconds(result.bufferingMs)],
          ["admin.buffering", number(result.bufferingEvents)],
          ["admin.dropped", number(result.droppedFrames)],
        ].map(([key, value]) =>
          el("div", {}, [
            el("span", { text: t(key) }),
            el("strong", { text: value }),
          ]),
        ),
      ),
    );
  });
  parent.append(
    el("h2", { text: t("ops.sessions") }),
    el("p", { class: "muted", text: t("ops.sessionScope") }),
    list,
    el("h3", { text: t("ops.comparison") }),
    el("div", { class: "form-grid" }, [
      field(t("ops.firstSession"), first),
      field(t("ops.secondSession"), second),
    ]),
    el("div", { class: "panel-actions" }, compare),
    comparison,
  );
  const update = () => {
    const sessions = getFiltered()
      .filter((item) => item.playedSeconds > 0 || item.errorCode)
      .reverse();
    list.replaceChildren(
      ...(sessions.length
        ? sessions.slice(0, 30).map((item) =>
            button(
              [
                el("span", { class: "session-main" }, [
                  el("strong", { text: item.title }),
                  el("small", {
                    text: `${item.profileName} · ${item.region} · ${dateTime(item.startedAt)}`,
                  }),
                ]),
                el("span", { class: "session-quality", text: item.quality }),
                el("span", { text: milliseconds(item.startupMs) }),
                el("span", {
                  class: `status-pill status-${item.state === "error" ? "critical" : item.bufferingEvents ? "warning" : "healthy"}`,
                  text: t(`media.${item.state}`),
                }),
              ],
              () => sessionDetails(item, navigate),
              "session-row",
              { "aria-label": `${t("common.details")} · ${item.title}` },
            ),
          )
        : [el("div", { class: "ops-empty", text: t("ops.noSessions") })]),
    );
    for (const input of [first, second]) {
      const value = input.value;
      input.replaceChildren(
        ...sessions.map((item) =>
          el("option", {
            value: item.id,
            text: `${item.title} · ${item.quality} · ${dateTime(item.startedAt)}`,
          }),
        ),
      );
      if (sessions.some((item) => item.id === value)) input.value = value;
    }
    if (!second.value || first.value === second.value)
      second.value = sessions[1]?.id || "";
  };
  update();
  return { update };
}
