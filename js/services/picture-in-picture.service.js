// Picture-in-picture moves the existing video surface; it never creates a player.
export function pictureInPicture(video, { document: doc = document, onChange = () => {}, onError = () => {} } = {}) {
  let pending = false, disposed = false;
  const snapshot = () => ({
    active: doc.pictureInPictureElement === video,
    pending,
    available: !!doc.pictureInPictureEnabled && !video.disablePictureInPicture &&
      typeof video.requestPictureInPicture === "function" && video.readyState >= 2 && video.videoWidth > 0,
  });
  const sync = () => { if (!disposed) onChange(snapshot()); };
  const events = ["loadeddata", "emptied", "error", "enterpictureinpicture", "leavepictureinpicture"];
  events.forEach((name) => video.addEventListener(name, sync));
  sync();
  return {
    async toggle() {
      if (disposed || pending || !snapshot().available) return false;
      pending = true;
      sync();
      try {
        if (snapshot().active) await doc.exitPictureInPicture();
        else await video.requestPictureInPicture();
        if (disposed && doc.pictureInPictureElement === video)
          await doc.exitPictureInPicture();
        return !disposed;
      } catch (error) {
        if (!disposed) onError(error);
        return false;
      } finally {
        pending = false;
        sync();
      }
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      events.forEach((name) => video.removeEventListener(name, sync));
      if (doc.pictureInPictureElement === video)
        void doc.exitPictureInPicture().catch(() => {});
    },
  };
}
