import test from "node:test";
import assert from "node:assert/strict";
import en from "../locales/en.js";
import es from "../locales/es.js";
import ar from "../locales/ar.js";
import it from "../locales/it.js";
// Minimal browser boundary; no UI implementation is mocked by the contract assertions.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
};
globalThis.document = { documentElement: { lang: "", dir: "" } };
const { translate, setLocalization, getLocalization } =
  await import("../js/services/localization.service.js");
const { writePreferences, readPreferences } =
  await import("../js/services/storage.service.js");
test("Spanish, Italian and Arabic dictionaries cover every English key", () => {
  for (const dict of [es, it, ar]) {
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(en).sort());
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, "string");
      assert.ok(value.trim(), key);
    }
  }
});
test("translation fallback is current language then English then key", () => {
  assert.equal(translate("es", "nav.home"), "Inicio");
  assert.equal(translate("pt", "player.play"), en["player.play"]);
  assert.equal(translate("unknown", "unknown.key"), "unknown.key");
  assert.equal(translate("es", "title.name", { name: "Sintel" }), "Sintel");
  assert.ok(
    !translate("es", "title.name", { name: {} }).includes("[object Object]"),
  );
});
test("RTL returns to LTR and changing language never changes selected region", () => {
  setLocalization("ar", "US");
  assert.equal(document.documentElement.dir, "rtl");
  assert.equal(document.documentElement.lang, "ar");
  setLocalization("es", "US");
  assert.equal(document.documentElement.dir, "ltr");
  assert.equal(getLocalization().region, "US");
  assert.equal(getLocalization().availability, "SUPPORTED");
  assert.throws(() => setLocalization("bad", "US"), RangeError);
});
test("storage allowlist, corruption and blocked storage are handled", () => {
  writePreferences({
    language: "es",
    region: "BO",
    myList: ["demo-1"],
    password: "fixture",
    secret: "fixture",
  });
  assert.deepEqual(readPreferences(), {
    language: "es",
    region: "BO",
    myList: ["demo-1"],
  });
  const key = [...store.keys()][0];
  store.set(key, "invalid JSON");
  assert.deepEqual(readPreferences(), {});
  store.set(key, "[]");
  assert.deepEqual(readPreferences(), {});
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readPreferences(), {});
  assert.equal(writePreferences({ language: "ar" }), false);
  assert.equal(setLocalization("ar", "US"), false);
  assert.equal(getLocalization().language, "ar");
  assert.equal(document.documentElement.dir, "rtl");
  globalThis.localStorage = original;
});
