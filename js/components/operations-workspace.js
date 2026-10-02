import { el, button, field, select } from "../utils/dom.js";
import { t, getLocalization } from "../services/localization.service.js";
import { titles } from "../data/titles.js";
import { REGIONS, regionName } from "../config/regions.js";
import {
  workspaceSnapshot,
  importWorkspace,
  saveWorkspaceRecord,
  capacityEstimate,
} from "../services/workspace.service.js";
import { downloadFile } from "../utils/export.js";
import { toast } from "./toast.js";
const money = (value) =>
  new Intl.NumberFormat(getLocalization().language, {
    style: "currency",
    currency: "USD",
  }).format(value);
export function operationsWorkspace() {
  const root = el("section", { class: "operations-workbench" });
  const nav = el("div", {
    class: "workspace-tabs",
    "aria-label": t("workspace.title"),
  });
  const body = el("div", { class: "workspace-body" });
  let active = "curation";
  const regionSelect = (all = false) =>
    select(
      [
        ...(all ? [["all", t("ops.allRegions")]] : []),
        ...REGIONS.map((item) => [
          item.code,
          regionName(item.code, getLocalization().language),
        ]),
      ],
      all ? "all" : getLocalization().region,
    );
  const input = (id, type = "text", extra = {}) =>
    el("input", { id, type, required: true, ...extra });
  const submit = (form, action) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        action();
        toast(t("common.saved"));
        draw();
      } catch {
        toast(t("workspace.invalid"), "error");
      }
    });
    form.append(
      el("button", {
        type: "submit",
        class: "button button-primary",
        text: t("workspace.save"),
      }),
    );
    return form;
  };
  const metric = (label, value) =>
    el("div", { class: "workspace-metric" }, [
      el("small", { text: t(label) }),
      el("strong", { text: value }),
    ]);
  const row = (children) =>
    el("article", { class: "workspace-record" }, children);
  const draw = () => {
    body.replaceChildren();
    for (const node of nav.children)
      node.setAttribute("aria-pressed", String(node.dataset.module === active));
    const data = workspaceSnapshot();
    if (active === "curation") {
      const region = regionSelect(true),
        title = select(
          titles.map((item) => [item.id, item.name]),
          titles[0].id,
          { id: "workspace-title" },
        );
      const priority = input("workspace-priority", "number", {
        min: 0,
        max: 100,
        value: 50,
      });
      const form = el("form", { class: "workspace-form" }, [
        field(t("settings.region"), region),
        field(t("workspace.titleChoice"), title),
        field(t("workspace.priority"), priority),
      ]);
      body.append(
        el("p", { class: "muted", text: t("workspace.curationHelp") }),
        submit(form, () =>
          saveWorkspaceRecord("curation", {
            region: region.value,
            titleId: title.value,
            priority: Number(priority.value),
          }),
        ),
      );
      for (const item of data.curation)
        body.append(
          row([
            el("strong", {
              text: titles.find((title) => title.id === item.titleId).name,
            }),
            el("span", { text: `${item.region} · ${item.priority}/100` }),
          ]),
        );
    } else if (active === "customers") {
      const name = input("workspace-customer");
      body.append(
        submit(
          el("form", { class: "workspace-form" }, [
            field(t("workspace.customer"), name),
          ]),
          () => saveWorkspaceRecord("customers", { name: name.value }),
        ),
      );
      const pending = data.invoices
        .filter((item) => item.status === "pending")
        .reduce((sum, item) => sum + item.amount, 0);
      const settled = data.invoices
        .filter((item) => item.status === "settled")
        .reduce((sum, item) => sum + item.amount, 0);
      body.append(
        el("div", { class: "workspace-metrics" }, [
          metric("workspace.clients", data.customers.length),
          metric("workspace.pending", money(pending)),
          metric("workspace.settled", money(settled)),
        ]),
      );
      for (const customer of data.customers)
        body.append(
          row([
            el("strong", { text: customer.name }),
            el("small", {
              text: `${t("workspace.invoices")}: ${data.invoices.filter((item) => item.customerId === customer.id).length}`,
            }),
          ]),
        );
      if (data.customers.length) {
        const customer = select(
          data.customers.map((item) => [item.id, item.name]),
          data.customers[0].id,
          { id: "workspace-invoice-customer" },
        );
        const amount = input("workspace-amount", "number", {
          min: 0.01,
          max: 1e8,
          step: 0.01,
        });
        const dueDate = input("workspace-due", "date");
        body.append(
          el("h3", { text: t("workspace.newInvoice") }),
          el("p", { class: "muted", text: t("workspace.billingHelp") }),
          submit(
            el("form", { class: "workspace-form" }, [
              field(t("workspace.customer"), customer),
              field(t("workspace.amount"), amount),
              field(t("workspace.dueDate"), dueDate),
            ]),
            () =>
              saveWorkspaceRecord("invoices", {
                customerId: customer.value,
                amount: Number(amount.value),
                dueDate: dueDate.value,
                status: "pending",
              }),
          ),
        );
      }
      for (const invoice of data.invoices)
        body.append(
          row([
            el("div", {}, [
              el("strong", {
                text: data.customers.find(
                  (item) => item.id === invoice.customerId,
                ).name,
              }),
              el("p", {
                text: `${money(invoice.amount)} · ${invoice.dueDate}`,
              }),
            ]),
            invoice.status === "pending"
              ? button(
                  t("workspace.recordPayment"),
                  () => {
                    try {
                      saveWorkspaceRecord("invoices", {
                        ...invoice,
                        status: "settled",
                      });
                      draw();
                    } catch {
                      toast(t("workspace.invalid"), "error");
                    }
                  },
                  "button button-ghost",
                )
              : el("span", {
                  class: "status-pill",
                  text: t("workspace.settled"),
                }),
          ]),
        );
    } else {
      const region = regionSelect();
      const inputs = {};
      const limits = {
        users: [0, 1e9, 1],
        mbps: [0.01, 100, 0.01],
        cachePercent: [0, 100, 0.1],
        nodes: [0, 1e6, 1],
        nodeHourly: [0, 1e6, 0.01],
        egressPerGb: [0, 1000, 0.001],
      };
      const form = el(
        "form",
        { class: "workspace-form" },
        field(t("settings.region"), region),
      );
      for (const [key, [min, max, step]] of Object.entries(limits)) {
        inputs[key] = input(`workspace-${key}`, "number", { min, max, step });
        form.append(field(t(`workspace.${key}`), inputs[key]));
      }
      const preview = el("div", { class: "workspace-metrics", role: "status" });
      const record = () => ({
        region: region.value,
        ...Object.fromEntries(
          Object.entries(inputs).map(([key, node]) => [
            key,
            Number(node.value),
          ]),
        ),
      });
      const recalc = () => {
        if (
          Object.values(inputs).some(
            (node) => !node.value || !node.checkValidity(),
          )
        ) {
          preview.replaceChildren();
          return;
        }
        const result = capacityEstimate(record());
        preview.replaceChildren(
          metric(
            "workspace.originTraffic",
            `${result.originGbHourly.toFixed(2)} GB/h`,
          ),
          metric("workspace.hourlyCost", `${money(result.hourlyCost)}/h`),
        );
      };
      form.addEventListener("input", recalc);
      const load = () => {
        const saved = data.regions.find((item) => item.region === region.value);
        for (const [key, node] of Object.entries(inputs))
          node.value = saved ? saved[key] : "";
        recalc();
      };
      region.addEventListener("change", load);
      load();
      body.append(
        el("p", { class: "muted", text: t("workspace.capacityHelp") }),
        submit(form, () => saveWorkspaceRecord("regions", record())),
        preview,
      );
      for (const item of data.regions) {
        const estimate = capacityEstimate(item);
        body.append(
          row([
            el("strong", {
              text: regionName(item.region, getLocalization().language),
            }),
            el("span", {
              text: `${item.users.toLocaleString()} · ${money(estimate.hourlyCost)}/h`,
            }),
          ]),
        );
      }
    }
    if (
      !data[
        active === "customers"
          ? "customers"
          : active === "curation"
            ? "curation"
            : "regions"
      ].length
    )
      body.append(el("p", { class: "muted", text: t("workspace.empty") }));
  };
  for (const [key, label] of [
    ["curation", "workspace.curation"],
    ["customers", "workspace.customers"],
    ["regions", "workspace.capacity"],
  ])
    nav.append(
      button(
        t(label),
        () => {
          active = key;
          draw();
        },
        "filter-chip",
        { "data-module": key },
      ),
    );
  const file = el("input", {
    type: "file",
    accept: "application/json,.json",
    id: "workspace-import",
  });
  file.addEventListener("change", async () => {
    try {
      if (!file.files[0]) return;
      if (file.files[0].size > 1e6) throw new RangeError("File too large");
      importWorkspace(JSON.parse(await file.files[0].text()));
      draw();
      toast(t("common.saved"));
    } catch {
      toast(t("workspace.invalid"), "error");
    } finally {
      file.value = "";
    }
  });
  root.append(
    el("h3", { text: t("workspace.title") }),
    el("p", { class: "muted", text: t("workspace.scope") }),
    el("div", { class: "workspace-io" }, [
      field(t("workspace.import"), file),
      button(
        t("workspace.export"),
        () =>
          downloadFile(
            "operations-workspace.json",
            JSON.stringify(workspaceSnapshot(), null, 2),
            "application/json",
          ),
        "button button-ghost",
      ),
    ]),
    nav,
    body,
  );
  draw();
  return root;
}
