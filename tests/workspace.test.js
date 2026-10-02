import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
const store = new Map();
globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
const { workspaceSnapshot, importWorkspace, saveWorkspaceRecord, capacityEstimate, curatedTitles } = await import("../js/services/workspace.service.js");
beforeEach(() => store.clear());
const payload = () => ({version:1, customers:[{id:"carla", name:"Carla Encinas"}], invoices:[], regions:[], curation:[]});
test("records persist and invoice settlement updates rather than duplicates", () => {
  importWorkspace(payload());
  saveWorkspaceRecord("invoices", {id:"invoice-1",customerId:"carla",amount:12.50,dueDate:"2026-10-31",status:"pending"});
  const invoice = workspaceSnapshot().invoices[0];
  saveWorkspaceRecord("invoices", {...invoice,status:"settled"});
  assert.equal(workspaceSnapshot().invoices.length, 1);
  assert.equal(workspaceSnapshot().invoices[0].status, "settled");
  const snapshot = workspaceSnapshot(); snapshot.customers[0].name = "Changed";
  assert.equal(workspaceSnapshot().customers[0].name, "Carla Encinas");
});
test("invalid imports leave prior records untouched", () => {
  importWorkspace(payload());
  const prior = workspaceSnapshot();
  for (const invoice of [
    {id:"bad",customerId:"missing",amount:10,dueDate:"2026-10-31",status:"pending"},
    {id:"bad",customerId:"carla",amount:10,dueDate:"2026-02-30",status:"pending"},
    {id:"bad",customerId:"carla",amount:-10,dueDate:"2026-10-31",status:"pending"}
  ]) {
    assert.throws(() => importWorkspace({...payload(),invoices:[invoice]}));
    assert.deepEqual(workspaceSnapshot(), prior);
  }
});
test("regional priorities rank catalog titles and exclude other regions", () => {
  saveWorkspaceRecord("curation", {region:"all",titleId:"sintel",priority:30});
  saveWorkspaceRecord("curation", {region:"BO",titleId:"spring",priority:90});
  assert.deepEqual(curatedTitles("BO").map(item => item.id), ["spring","sintel"]);
  assert.deepEqual(curatedTitles("IT").map(item => item.id), ["sintel"]);
});
test("capacity uses entered bandwidth and cache percentage with zero boundaries", () => {
  const values = {users:1000,mbps:4,cachePercent:80,nodes:2,nodeHourly:1,egressPerGb:0.02};
  assert.ok(Math.abs(capacityEstimate(values).originGbHourly - 360) < 1e-8);
  assert.ok(Math.abs(capacityEstimate(values).hourlyCost - 9.2) < 1e-8);
  assert.equal(capacityEstimate({...values,cachePercent:100}).originGbHourly,0);
  assert.equal(capacityEstimate({...values,users:0,nodes:0}).hourlyCost,0);
  assert.throws(() => saveWorkspaceRecord("regions", {...values,region:"BO",cachePercent:101}));
});
