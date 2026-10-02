import { titles } from "../data/titles.js";
import { REGIONS } from "../config/regions.js";
import { eventBus } from "./event-bus.service.js";
const KEY = "nsip.workspace.v1";
const empty = () => ({
  version: 1,
  curation: [],
  customers: [],
  invoices: [],
  regions: [],
});
const regionValid = (value) => REGIONS.some((item) => item.code === value);
const text = (value, max = 80) =>
  typeof value === "string" && value.trim() && value.length <= max;
const bounded = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;
export function validateWorkspace(data) {
  if (
    !data ||
    data.version !== 1 ||
    !["curation", "customers", "invoices", "regions"].every((key) =>
      Array.isArray(data[key]),
    )
  )
    throw new RangeError("Invalid workspace");
  if (
    data.curation.length > 128 ||
    data.customers.length > 256 ||
    data.invoices.length > 512 ||
    data.regions.length > 64
  )
    throw new RangeError("Record limit");
  const result = empty();
  const unique = (records, key) =>
    new Set(records.map(key)).size === records.length;
  if (
    !unique(data.customers, (item) => item.id) ||
    !unique(data.invoices, (item) => item.id) ||
    !unique(data.regions, (item) => item.region) ||
    !unique(data.curation, (item) => `${item.region}/${item.titleId}`)
  )
    throw new RangeError("Duplicate records");
  for (const item of data.customers) {
    if (!item || !text(item.id) || !text(item.name))
      throw new RangeError("Invalid customer");
    result.customers.push({ id: item.id, name: item.name.trim() });
  }
  for (const item of data.invoices) {
    if (
      !item ||
      !text(item.id) ||
      !result.customers.some((customer) => customer.id === item.customerId) ||
      !bounded(item.amount, 0.01, 1e8) ||
      !["pending", "settled"].includes(item.status) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) ||
      !Number.isFinite(Date.parse(item.dueDate)) ||
      new Date(item.dueDate).toISOString().slice(0, 10) !== item.dueDate
    )
      throw new RangeError("Invalid invoice");
    result.invoices.push({
      id: item.id,
      customerId: item.customerId,
      amount: Math.round(item.amount * 100) / 100,
      dueDate: item.dueDate,
      status: item.status,
    });
  }
  for (const item of data.curation) {
    if (
      !item ||
      !(item.region === "all" || regionValid(item.region)) ||
      !titles.some((title) => title.id === item.titleId) ||
      !bounded(item.priority, 0, 100)
    )
      throw new RangeError("Invalid curation");
    result.curation.push({
      region: item.region,
      titleId: item.titleId,
      priority: item.priority,
    });
  }
  for (const item of data.regions) {
    if (
      !item ||
      !regionValid(item.region) ||
      !bounded(item.users, 0, 1e9) ||
      !Number.isInteger(item.users) ||
      !bounded(item.mbps, 0.01, 100) ||
      !bounded(item.cachePercent, 0, 100) ||
      !Number.isInteger(item.nodes) ||
      !bounded(item.nodes, 0, 1e6) ||
      !bounded(item.nodeHourly, 0, 1e6) ||
      !bounded(item.egressPerGb, 0, 1000)
    )
      throw new RangeError("Invalid capacity");
    result.regions.push({
      region: item.region,
      users: item.users,
      mbps: item.mbps,
      cachePercent: item.cachePercent,
      nodes: item.nodes,
      nodeHourly: item.nodeHourly,
      egressPerGb: item.egressPerGb,
    });
  }
  return result;
}
export function workspaceSnapshot() {
  try {
    return validateWorkspace(
      JSON.parse(localStorage.getItem(KEY) || JSON.stringify(empty())),
    );
  } catch {
    return empty();
  }
}
function commit(data, module) {
  const valid = validateWorkspace(data);
  localStorage.setItem(KEY, JSON.stringify(valid));
  eventBus.emit("WORKSPACE_UPDATED", module);
  return valid;
}
export function importWorkspace(data) {
  const incoming = validateWorkspace(data),
    previous = workspaceSnapshot();
  const keyOf = {
    customers: (item) => item.id,
    invoices: (item) => item.id,
    regions: (item) => item.region,
    curation: (item) => `${item.region}/${item.titleId}`,
  };
  const next = empty();
  for (const key of Object.keys(keyOf))
    next[key] = [
      ...new Map(
        [...previous[key], ...incoming[key]].map((item) => [
          keyOf[key](item),
          item,
        ]),
      ).values(),
    ];
  return commit(next, "import");
}
export function saveWorkspaceRecord(collection, record) {
  const data = workspaceSnapshot();
  if (!["customers", "invoices", "regions", "curation"].includes(collection))
    throw new RangeError("Unknown collection");
  const item = ["customers", "invoices"].includes(collection)
    ? { ...record, id: record.id || crypto.randomUUID() }
    : record;
  const keyOf = (entry) =>
    collection === "curation"
      ? `${entry.region}/${entry.titleId}`
      : collection === "regions"
        ? entry.region
        : entry.id;
  const index = data[collection].findIndex(
    (entry) => keyOf(entry) === keyOf(item),
  );
  if (index >= 0) data[collection][index] = item;
  else data[collection].push(item);
  return commit(data, collection);
}
export function capacityEstimate(item) {
  const originGbHourly =
    ((((item.users * item.mbps) / 8) * 3600) / 1000) *
    (1 - item.cachePercent / 100);
  return {
    originGbHourly,
    hourlyCost:
      item.nodes * item.nodeHourly + originGbHourly * item.egressPerGb,
  };
}
export function curatedTitles(region) {
  return workspaceSnapshot()
    .curation.filter((item) => item.region === "all" || item.region === region)
    .sort((a, b) => b.priority - a.priority)
    .map((item) => titles.find((title) => title.id === item.titleId))
    .filter(
      (title, index, items) =>
        items.findIndex((item) => item.id === title.id) === index,
    );
}
