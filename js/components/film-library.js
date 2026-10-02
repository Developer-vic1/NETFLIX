import { el, button, field, select } from "../utils/dom.js";
import { t, getLocalization } from "../services/localization.service.js";
import {
  libraryRecords,
  saveFilm,
  setFilmStatus,
  inspectVideo,
} from "../services/library.service.js";
import { formatDuration } from "../utils/time.js";
export function filmLibrary(navigate) {
  const root = el("section", { class: "film-library" }),
    editor = el("div"),
    list = el("div", { class: "library-list" });
  editor.hidden = true;
  let selected,
    file,
    cover,
    media,
    busy = false,
    disposed = false,
    revision = 0;
  let previewUrls = [];
  const revoke = () => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
  };
  const previewUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    previewUrls.push(url);
    return url;
  };
  const status = el("p", {
    class: "library-status",
    role: "status",
    "aria-live": "polite",
  });
  const search = el("input", {
    type: "search",
    id: "library-search",
    placeholder: t("library.search"),
  });
  const filter = select(
    ["all", "published", "draft"].map((value) => [
      value,
      t(`library.filter.${value}`),
    ]),
    "all",
    { id: "library-filter" },
  );
  const summary = el("div", { class: "library-summary", role: "status" });
  const refreshStatus = async (record, next) => {
    if (busy) return;
    busy = true;
    status.textContent = t("library.saving");
    try {
      const updated = await setFilmStatus(record.id, next);
      if (disposed) return;
      status.textContent = t(
        next === "published"
          ? "library.publishedMessage"
          : "library.draftMessage",
      );
      if (selected?.id === record.id) selected = updated;
      drawList();
    } catch (error) {
      if (!disposed)
        status.textContent = t(
          error?.message?.startsWith("library.")
            ? error.message
            : "library.saveError",
        );
    } finally {
      busy = false;
    }
  };
  const drawList = () => {
    list.replaceChildren(el("h3", { text: t("library.records") }));
    const saved = libraryRecords();
    const countPublished = saved.filter(
      (record) => record.status === "published" && !record.invalidVideo,
    ).length;
    const countDraft = saved.length - countPublished;
    const megabytes =
      saved.reduce(
        (total, record) => total + record.video.size + record.cover.size,
        0,
      ) / 1048576;
    summary.replaceChildren(
      el("span", {
        text: `${saved.length} ${t(saved.length === 1 ? "library.countTotalOne" : "library.countTotal")}`,
      }),
      el("span", {
        text: `${countPublished} ${t(countPublished === 1 ? "library.countPublishedOne" : "library.countPublished")}`,
      }),
      el("span", {
        text: `${countDraft} ${t(countDraft === 1 ? "library.countDraftOne" : "library.countDraft")}`,
      }),
      el("span", {
        text: `${new Intl.NumberFormat(getLocalization().language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(megabytes)} MB ${t("library.countSpace")}`,
      }),
    );
    const query = search.value
      .trim()
      .toLocaleLowerCase(getLocalization().language);
    const displayed = saved
      .filter(
        (record) =>
          (filter.value === "all" ||
            (filter.value === "draft"
              ? record.status === "draft" || record.invalidVideo
              : record.status === "published" && !record.invalidVideo)) &&
          `${record.metadata.name} ${record.metadata.genre} ${record.metadata.creator}`
            .toLocaleLowerCase(getLocalization().language)
            .includes(query),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (!displayed.length)
      list.append(el("p", { class: "muted", text: t("library.empty") }));
    for (const record of displayed)
      list.append(
        el("article", { class: "library-record" }, [
          el("div", {}, [
            el("strong", { text: record.metadata.name }),
            el("p", {
              class: "muted",
              text: `${record.metadata.year} · ${formatDuration(record.media.duration, getLocalization().language)} · ${t(record.invalidVideo ? "library.replaceMp4" : `library.${record.status}`)}`,
            }),
          ]),
          el("div", { class: "panel-actions" }, [
            button(
              t("library.edit"),
              () => drawEditor(record),
              "button button-ghost",
            ),
            record.status === "published" && !record.invalidVideo
              ? button(
                  t("title.play"),
                  () => navigate(`player?title=${record.id}`),
                  "button button-ghost",
                )
              : null,
            record.invalidVideo
              ? null
              : button(
                  t(
                    record.status === "published"
                      ? "library.unpublish"
                      : "library.publishNow",
                  ),
                  () =>
                    void refreshStatus(
                      record,
                      record.status === "published" ? "draft" : "published",
                    ),
                  "button button-ghost",
                ),
          ]),
        ]),
      );
  };
  const drawEditor = (record, focus = false) => {
    if (busy) return;
    revision++;
    revoke();
    selected = record;
    file = record?.video;
    cover = record?.cover;
    media = record?.media;
    editor.replaceChildren();
    editor.hidden = false;
    status.textContent = "";
    const values = record?.metadata || {};
    const input = (id, value, type = "text", attrs = {}) =>
      el("input", { id, type, value: value ?? "", required: true, ...attrs });
    const name = input("film-name", values.name, "text", { maxlength: 100 });
    const description = el(
      "textarea",
      {
        id: "film-description",
        required: true,
        minlength: 20,
        maxlength: 2000,
        rows: 5,
      },
      values.description || "",
    );
    const year = input(
      "film-year",
      values.year || new Date().getFullYear(),
      "number",
      { min: 1888, max: new Date().getFullYear() + 5 },
    );
    const creator = input("film-creator", values.creator, "text", {
      maxlength: 160,
    });
    const genre = input("film-genre", values.genre, "text", { maxlength: 60 });
    const rating = select(
      ["all", "7+", "13+", "16+", "18+"].map((value) => [
        value,
        value === "all" ? t("library.allAges") : value,
      ]),
      values.ageRating || "all",
      { id: "film-rating" },
    );
    const language = select(
      ["es", "en", "it", "ar", "other"].map((value) => [
        value,
        value === "other"
          ? t("library.other")
          : new Intl.DisplayNames([getLocalization().language], {
              type: "language",
            }).of(value),
      ]),
      values.originalLanguage || getLocalization().language,
      { id: "film-language" },
    );
    const videoInput = el("input", {
      id: "film-video",
      type: "file",
      accept: "video/mp4,.mp4",
      "aria-describedby": "film-video-feedback",
    });
    const coverInput = el("input", {
      id: "film-cover",
      type: "file",
      accept: "image/jpeg,image/png,image/webp",
      "aria-describedby": "film-cover-feedback",
    });
    const videoFeedback = el("p", {
      id: "film-video-feedback",
      class: "library-inline-feedback",
      role: "status",
      "aria-live": "polite",
    });
    const coverFeedback = el("p", {
      id: "film-cover-feedback",
      class: "library-inline-feedback",
      role: "status",
      "aria-live": "polite",
    });
    const formFeedback = el("p", {
      class: "library-inline-feedback",
      role: "status",
      "aria-live": "polite",
    });
    const setFeedback = (node, message, tone = "error") => {
      node.textContent = message;
      node.dataset.tone = tone;
      if (node === videoFeedback || node === coverFeedback)
        (node === videoFeedback ? videoInput : coverInput).setAttribute(
          "aria-invalid",
          String(Boolean(message) && tone === "error"),
        );
    };
    let videoRejected = Boolean(record?.invalidVideo),
      coverRejected = false;
    if (videoRejected) setFeedback(videoFeedback, t("library.replaceMp4"));
    const preview = el("video", {
      class: "library-video",
      controls: true,
      playsinline: true,
      preload: "metadata",
    });
    const emptyPreview = el("div", {
      class: "library-empty-preview",
      text: t("library.noVideo"),
    });
    const poster = el("img", {
      class: "library-cover",
      alt: t("library.cover"),
    });
    const facts = el("p", { class: "library-media-facts" });
    const files = el("p", { class: "muted library-file-names" });
    const previewName = el("strong", {
      class: "library-preview-name",
      text: name.value || t("library.name"),
    });
    const previewSynopsis = el("p", {
      class: "muted",
      text: description.value,
    });
    name.addEventListener(
      "input",
      () => (previewName.textContent = name.value || t("library.name")),
    );
    description.addEventListener(
      "input",
      () => (previewSynopsis.textContent = description.value),
    );
    const updatePreview = () => {
      revoke();
      preview.hidden = !file;
      emptyPreview.hidden = Boolean(file);
      facts.hidden = !media;
      if (file) preview.src = previewUrl(file);
      else {
        preview.removeAttribute("src");
        preview.load();
      }
      if (cover) {
        poster.src = previewUrl(cover);
        preview.poster = poster.src;
      } else {
        poster.removeAttribute("src");
        preview.removeAttribute("poster");
      }
      poster.hidden = !cover;
      facts.textContent = media
        ? `MP4${media.brand ? ` · ${media.brand}` : ""} · ${formatDuration(media.duration, getLocalization().language)} · ${media.width} × ${media.height} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
        : t("library.noVideo");
      files.textContent = [file?.name, cover?.name].filter(Boolean).join(" · ");
    };
    const form = el("form", { class: "library-editor", novalidate: true });
    const save = el("button", {
      type: "submit",
      class: "button button-primary",
      text: t("library.publish"),
    });
    const draft = button(
      t(
        record?.status === "published"
          ? "library.saveAndWithdraw"
          : "library.saveDraft",
      ),
      () => {
        void submit("draft");
      },
      "button button-ghost",
    );
    const lock = (value) => {
      busy = value;
      for (const node of form.querySelectorAll("input,textarea,select,button"))
        node.disabled = value;
      root.setAttribute("aria-busy", String(value));
    };
    const submit = async (publication) => {
      if (busy) return;
      if (videoRejected || coverRejected) {
        const message = t("library.requiredMedia");
        status.textContent = message;
        setFeedback(formFeedback, message);
        (videoRejected ? videoInput : coverInput).focus();
        return;
      }
      const invalid = [name, description, year, creator, genre].find(
        (input) => !input.checkValidity(),
      );
      if (invalid) {
        const message = t("library.invalid");
        setFeedback(formFeedback, message);
        status.textContent = message;
        invalid.focus();
        return;
      }
      if (!file || !cover || !media) {
        const message = t("library.requiredMedia");
        status.textContent = message;
        setFeedback(formFeedback, message);
        if (!file || !media)
          setFeedback(videoFeedback, t("library.videoMissing"));
        if (!cover) setFeedback(coverFeedback, t("library.coverMissing"));
        (!file || !media ? videoInput : coverInput).focus();
        return;
      }
      formFeedback.textContent = "";
      const metadata = {
        name: name.value,
        description: description.value,
        creator: creator.value,
        genre: genre.value,
        year: Number(year.value),
        ageRating: rating.value,
        originalLanguage: language.value,
      };
      lock(true);
      status.textContent = t("library.saving");
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (
          estimate &&
          !selected &&
          Number.isFinite(estimate.quota) &&
          estimate.quota - estimate.usage < file.size + cover.size
        )
          throw new Error("library.spaceError");
        const result = await saveFilm({
          id: selected?.id,
          metadata,
          video: file,
          cover,
          media,
          status: publication,
        });
        if (disposed) return;
        lock(false);
        drawList();
        drawEditor(result);
        status.textContent = t(
          publication === "published"
            ? "library.publishedMessage"
            : "library.draftMessage",
        );
      } catch (error) {
        if (!disposed) {
          lock(false);
          const message = t(
            error.name === "QuotaExceededError"
              ? "library.spaceError"
              : error.message.startsWith("library.")
                ? error.message
                : "library.saveError",
          );
          status.textContent = message;
          setFeedback(formFeedback, message);
        }
      }
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit("published");
    });
    videoInput.addEventListener("change", async () => {
      const candidate = videoInput.files[0];
      if (!candidate) return;
      videoRejected = true;
      const generation = ++revision;
      lock(true);
      status.textContent = t("library.reading");
      try {
        const info = await inspectVideo(candidate);
        if (disposed || generation !== revision) return;
        file = candidate;
        media = info;
        videoRejected = false;
        updatePreview();
        status.textContent = t("library.videoReady");
        setFeedback(videoFeedback, t("library.videoReady"), "success");
        formFeedback.textContent = "";
      } catch (error) {
        if (!disposed && generation === revision) {
          const message = t(
            error?.message?.startsWith("library.mp4")
              ? error.message
              : "library.videoError",
          );
          status.textContent = message;
          setFeedback(videoFeedback, message);
        }
        videoInput.value = "";
      } finally {
        if (!disposed && generation === revision) lock(false);
      }
    });
    coverInput.addEventListener("change", async () => {
      const candidate = coverInput.files[0];
      if (!candidate) return;
      coverRejected = true;
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(candidate.type) ||
        candidate.size > 12 * 1024 * 1024
      ) {
        const message = t("library.coverError");
        status.textContent = message;
        setFeedback(coverFeedback, message);
        coverInput.value = "";
        return;
      }
      const generation = ++revision;
      lock(true);
      try {
        const image = await createImageBitmap(candidate);
        image.close();
        if (disposed || generation !== revision) return;
        cover = candidate;
        coverRejected = false;
        updatePreview();
        status.textContent = "";
        setFeedback(coverFeedback, "", "success");
        formFeedback.textContent = "";
      } catch {
        if (!disposed) {
          const message = t("library.coverError");
          status.textContent = message;
          setFeedback(coverFeedback, message);
        }
        coverInput.value = "";
      } finally {
        if (!disposed && generation === revision) lock(false);
      }
    });
    form.append(
      el("div", { class: "library-fields" }, [
        el("h3", { text: t(record ? "library.edit" : "library.add") }),
        formFeedback,
        field(t("library.name"), name),
        field(t("library.description"), description),
        el("div", { class: "library-grid" }, [
          field(t("library.year"), year),
          field(t("library.rating"), rating),
          field(t("library.genre"), genre),
          field(t("library.language"), language),
        ]),
        field(t("library.creator"), creator),
        el("div", { class: "library-upload" }, [
          field(t("library.video"), videoInput, t("library.videoHint")),
          videoFeedback,
        ]),
        el("div", { class: "library-upload" }, [
          field(t("library.cover"), coverInput, t("library.coverHint")),
          coverFeedback,
        ]),
        el("div", { class: "panel-actions" }, [draft, save]),
      ]),
      el("aside", { class: "library-preview" }, [
        el("h3", { text: t("library.preview") }),
        previewName,
        previewSynopsis,
        emptyPreview,
        preview,
        facts,
        files,
        poster,
        el("p", { class: "muted", text: t("library.localScope") }),
      ]),
    );
    updatePreview();
    editor.append(form);
    if (focus) {
      status.textContent = t("library.newReady");
      name.focus();
    }
  };
  root.append(
    el("h2", { text: t("library.title") }),
    el("p", { class: "muted", text: t("library.help") }),
    button(t("library.add"), () => drawEditor(undefined, true), "button button-ghost"),
    status,
    editor,
    el("div", { class: "library-toolbar" }, [
      field(t("nav.search"), search),
      field(t("library.filterLabel"), filter),
    ]),
    summary,
    list,
  );
  search.addEventListener("input", drawList);
  filter.addEventListener("change", drawList);
  drawList();
  return {
    root,
    destroy() {
      disposed = true;
      revision++;
      revoke();
      root.querySelectorAll("video").forEach((video) => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
    },
  };
}
