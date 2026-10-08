import test from "node:test";
import assert from "node:assert/strict";
import { pictureInPicture } from "../js/services/picture-in-picture.service.js";
function fixture() {
  const video = new EventTarget();
  Object.assign(video, { readyState: 4, videoWidth: 1280 });
  const doc = { pictureInPictureEnabled: true, pictureInPictureElement: null };
  let requests = 0, exits = 0, changes = [], errors = [];
  video.requestPictureInPicture = async () => {
    requests++;
    doc.pictureInPictureElement = video;
    video.dispatchEvent(new Event("enterpictureinpicture"));
  };
  doc.exitPictureInPicture = async () => {
    exits++;
    doc.pictureInPictureElement = null;
    video.dispatchEvent(new Event("leavepictureinpicture"));
  };
  const control = pictureInPicture(video, { document: doc, onChange: state => changes.push(state), onError: error => errors.push(error) });
  return { video, doc, control, changes, errors, get requests() { return requests; }, get exits() { return exits; } };
}
test("floating window uses the same video and serializes repeated activation", async () => {
  const f = fixture();
  const result = f.control.toggle();
  assert.equal(await f.control.toggle(), false);
  assert.equal(await result, true);
  assert.equal(f.requests, 1);
  assert.equal(f.doc.pictureInPictureElement, f.video);
  assert.equal(f.changes.at(-1).active, true);
  await f.control.toggle();
  assert.equal(f.exits, 1);
  assert.equal(f.changes.at(-1).active, false);
});
test("disposing during activation closes the late window and removes listeners", async () => {
  const f = fixture();
  let resolve;
  f.video.requestPictureInPicture = () => new Promise(done => { resolve = () => { f.doc.pictureInPictureElement = f.video; done(); }; });
  const pending = f.control.toggle();
  f.control.destroy();
  const count = f.changes.length;
  resolve();
  assert.equal(await pending, false);
  assert.equal(f.exits, 1);
  f.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(f.changes.length, count);
  assert.equal(await f.control.toggle(), false);
});
test("unsupported or unloaded videos cannot open a window and failures allow retry", async () => {
  const f = fixture();
  f.video.readyState = 0;
  assert.equal(await f.control.toggle(), false);
  assert.equal(f.requests, 0);
  f.video.readyState = 4;
  f.video.requestPictureInPicture = async () => { throw new Error("PiP unavailable"); };
  assert.equal(await f.control.toggle(), false);
  assert.equal(f.errors.length, 1);
  assert.equal(f.changes.at(-1).pending, false);
});
test("disposing an active window closes it only once", async () => {
  const f = fixture();
  await f.control.toggle();
  f.control.destroy();
  f.control.destroy();
  assert.equal(f.exits, 1);
});
