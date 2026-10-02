import { el, button, field, select } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
import {
  operationsSnapshot,
  updateIncident,
  saveThresholds,
} from "../services/operations-store.service.js";
import { dateTime, number } from "../utils/format.js";
import { openModal } from "./modal.js";
import { toast } from "./toast.js";
export function incidentsPanel(
  parent,
  navigate,
  getFiltered = () => operationsSnapshot().incidents,
) {
  const list = el("div", { class: "incident-list" }),
    status = select(
      [
        ["all", t("common.all")],
        ...["open", "investigating", "resolved"].map((value) => [
          value,
          t(`ops.${value}`),
        ]),
      ],
      "all",
      { id: "incident-filter" },
    );
  const view = (incident) => {
    const note = el("textarea", {
      id: "incident-note",
      maxlength: 500,
      rows: 4,
      placeholder: t("ops.noteHint"),
    });
    const current = select(
      ["open", "investigating", "resolved"].map((value) => [
        value,
        t(`ops.${value}`),
      ]),
      incident.status,
      { id: "incident-status" },
    );
    const notes = el(
      "div",
      { class: "stack" },
      incident.notes.map((item) =>
        el("blockquote", {}, [
          el("p", { text: item.text }),
          el("small", { text: dateTime(item.time) }),
        ]),
      ),
    );
    const form = el("form", { class: "stack" }, [
      el("p", { class: "notice", text: t(`ops.action.${incident.kind}`) }),
      el("p", {
        class: "muted",
        text: `${incident.region} · ${dateTime(incident.createdAt)} · ${number(incident.value)} / ${number(incident.threshold)}`,
      }),
      field(t("admin.state"), current),
      field(t("ops.note"), note),
      el("button", {
        type: "submit",
        class: "button button-primary",
        text: t("common.save"),
      }),
      notes,
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      updateIncident(incident.id, { status: current.value, note: note.value });
      dialog.close();
      update();
      toast(t("common.saved"), "success");
    });
    if (incident.titleId)
      form.append(
        button(t("ops.retest"), () => {
          dialog.close();
          navigate(`player?title=${incident.titleId}`);
        }),
      );
    const dialog = openModal({
      title: t(`ops.issue.${incident.kind}`),
      content: form,
    });
  };
  const update = () => {
    const incidents = getFiltered()
      .filter((item) => status.value === "all" || item.status === status.value)
      .reverse();
    list.replaceChildren(
      ...(incidents.length
        ? incidents.map((item) =>
            button(
              [
                el("span", { class: `status-dot severity-${item.severity}` }),
                el("span", { class: "session-main" }, [
                  el("strong", { text: t(`ops.issue.${item.kind}`) }),
                  el("small", {
                    text: `${item.region} · ${dateTime(item.createdAt)}`,
                  }),
                ]),
                el("span", {
                  class: "status-pill",
                  text: t(`ops.${item.status}`),
                }),
              ],
              () => view(item),
              "session-row",
            ),
          )
        : [el("div", { class: "ops-empty", text: t("ops.noIncidents") })]),
    );
  };
  status.addEventListener("change", update);
  parent.append(
    el("h2", { text: t("ops.incidents") }),
    field(t("ops.filterState"), status),
    list,
  );
  const thresholds = operationsSnapshot().thresholds;
  const inputs = new Map();
  const fields = [
    ["responseMs", "ops.responseLimit", 10, 60000, 1],
    ["startupMs", "ops.startupLimit", 100, 60000, 1],
    ["bufferingEvents", "ops.bufferLimit", 1, 100, 1],
    ["droppedPercent", "ops.frameLimit", 0.1, 100, 0.1],
  ].map(([key, label, min, max, step]) => {
    const input = el("input", {
      id: `threshold-${key}`,
      type: "number",
      min,
      max,
      step,
      value: thresholds[key],
      required: true,
    });
    inputs.set(key, input);
    return field(t(label), input);
  });
  const form = el("form", { class: "threshold-form" }, [
    el("h3", { text: t("ops.thresholds") }),
    el("p", { class: "muted", text: t("ops.thresholdScope") }),
    el("div", { class: "form-grid" }, fields),
    el("button", {
      type: "submit",
      class: "button button-primary",
      text: t("ops.saveThresholds"),
    }),
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      saveThresholds(
        Object.fromEntries(
          [...inputs].map(([key, input]) => [key, Number(input.value)]),
        ),
      );
      toast(t("common.saved"), "success");
    } catch {
      toast(t("ops.invalidThreshold"), "error");
    }
  });
  parent.append(form);
  update();
  return { update };
}
