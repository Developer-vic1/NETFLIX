import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
};
const {
  activeProfile,
  getProfiles,
  profilePreferences,
  saveProfilePreferences,
  switchProfile,
  saveProfile,
  deleteProfile,
} = await import("../js/services/profile.service.js");
const { readPreferences, writePreferences } =
  await import("../js/services/storage.service.js");
const { recordProgress } =
  await import("../js/services/viewing-history.service.js");
beforeEach(() => store.clear());
test("default names are real names and invalid selections fall back safely", () => {
  assert.equal(activeProfile().name, "Víctor Asturizaga");
  assert.ok(getProfiles().some((profile) => profile.name === "Carla Encinas"));
  assert.ok(getProfiles().some((profile) => profile.role === "admin"));
  writePreferences({ selectedProfile: "removed-profile" });
  assert.equal(activeProfile().id, "victor");
  assert.throws(() => switchProfile("unknown"), RangeError);
});
test("list, player preferences and progress remain separate per profile", () => {
  saveProfilePreferences({
    myList: ["sintel"],
    playerPreferences: { quality: "360p" },
  });
  recordProgress("sintel", 30, 888);
  switchProfile("carla");
  assert.deepEqual(profilePreferences().myList, []);
  saveProfilePreferences({ myList: ["spring"] });
  recordProgress("sintel", 40, 888, "victor");
  assert.equal(
    profilePreferences().playerPreferences?.positions?.sintel,
    undefined,
  );
  switchProfile("victor");
  assert.deepEqual(profilePreferences().myList, ["sintel"]);
  assert.equal(profilePreferences().playerPreferences.quality, "360p");
  assert.equal(profilePreferences().playerPreferences.positions.sintel, 40);
});
test("saving settings preserves recorded history and migrates existing local list", () => {
  writePreferences({
    myList: ["sintel"],
    playerPreferences: { quality: "360p", progress: { sintel: 20 } },
  });
  assert.deepEqual(profilePreferences().myList, ["sintel"]);
  const preferences = profilePreferences().playerPreferences;
  saveProfilePreferences({
    playerPreferences: { ...preferences, favoriteType: "series" },
  });
  assert.equal(profilePreferences().playerPreferences.progress.sintel, 20);
});
test("profile management validates names and protects administrator and last viewer", () => {
  assert.throws(() => saveProfile(null, " "), RangeError);
  assert.throws(() => saveProfile(null, "x".repeat(25)), RangeError);
  saveProfile(null, "Luis", "teal");
  const profile = getProfiles().find((item) => item.name === "Luis");
  assert.equal(profile.role, "viewer");
  assert.throws(() => saveProfile(profile.id, "Luisa", "purple"), RangeError);
  saveProfile(profile.id, "Luisa", "teal");
  assert.equal(
    getProfiles().find((item) => item.id === profile.id).name,
    "Luisa",
  );
  assert.equal(deleteProfile("administrator"), false);
  assert.equal(deleteProfile(profile.id), true);
  assert.equal(deleteProfile("carla"), true);
  assert.equal(deleteProfile("victor"), false);
});
test("switching and editing fail clearly when browser storage is blocked", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  try {
    assert.throws(() => switchProfile("carla"));
    assert.throws(() => saveProfile(null, "Luis"));
    assert.equal(saveProfilePreferences({ myList: [] }), false);
  } finally {
    globalThis.localStorage = original;
  }
  assert.deepEqual(readPreferences(), {});
});
