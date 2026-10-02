async (page) => {
  const results = [],
    errors = [],
    failedRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      failedRequests.push(`${response.status()} ${response.url()}`);
  });
  const check = (name, pass) => results.push({ name, pass: !!pass });
  const base = "http://127.0.0.1:4173/";
  const navigate = async (route) => {
    await page.goto(`${base}#/${route}`);
    await page.waitForFunction(
      (expected) => document.querySelector("#app").dataset.route === expected && !document.documentElement.classList.contains('route-transition'),
      route.split("?")[0],
    );
  };
  const switchTo = async (name) => {
    await page.locator(".profile-trigger").click();
    await page.locator(".profile-option").filter({ hasText: name }).click();
    await page.locator("dialog").waitFor({ state: "detached" });
  };
  await navigate("profiles");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setViewportSize({ width: 1366, height: 900 });
  check(
    "real profile names and administrator appear",
    (await page.getByText("Víctor Asturizaga", { exact: true }).count()) ===
      1 &&
      (await page.getByText("Carla Encinas", { exact: true }).count()) === 1 &&
      !/\bdemo\b/i.test(await page.locator("body").innerText()),
  );
  await page.locator('[data-profile-id="victor"]').click();
  await page.locator('[data-list-id="sintel"]').first().click();
  await page
    .getByRole("button", { name: "Notificaciones", exact: true })
    .click();
  check(
    "notifications reflect actual list activity",
    (await page
      .getByText("Sintel se añadió a tu lista.", { exact: true })
      .count()) === 1,
  );
  await page
    .getByRole("button", { name: "Marcar como leídas", exact: true })
    .click();
  check(
    "notifications can be marked read",
    await page.locator(".notification-count").isHidden(),
  );
  await page.keyboard.press("Escape");
  await page.locator("dialog").waitFor({ state: "detached" });
  await navigate("my-list");
  check(
    "Victor list stores real title",
    (await page.locator("main article").count()) === 1 &&
      (await page.locator("main h3").textContent()) === "Sintel",
  );
  await switchTo("Carla Encinas");
  await navigate("my-list");
  check(
    "Carla list is independent",
    (await page.locator("main article").count()) === 0,
  );
  await navigate("movies");
  await page.locator('[data-list-id="spring"]').click();
  await switchTo("Víctor Asturizaga");
  await navigate("my-list");
  check(
    "profile switching preserves Victor list",
    (await page.locator("main article").count()) === 1 &&
      (await page.locator("main h3").textContent()) === "Sintel",
  );
  await navigate("profiles");
  await page
    .getByRole("button", { name: "Añadir perfil", exact: true })
    .click();
  await page.locator("#profile-name").fill("Luis");
  await page.locator("#profile-color").selectOption("teal");
  await page.locator('dialog button[type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  check(
    "a first-name-only profile can be created",
    (await page
      .locator(".profile-tile")
      .filter({ hasText: "Luis" })
      .count()) === 1,
  );
  await page
    .locator(".profile-tile")
    .filter({ hasText: "Luis" })
    .getByRole("button", { name: "Editar perfil" })
    .click();
  await page.locator("#profile-name").fill("Luisa");
  await page.locator('dialog button[type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  check(
    "profile name can be edited",
    (await page
      .locator(".profile-tile")
      .filter({ hasText: "Luisa" })
      .count()) === 1,
  );
  await page
    .locator(".profile-tile")
    .filter({ hasText: "Luisa" })
    .getByRole("button", { name: "Editar perfil" })
    .click();
  await page
    .getByRole("button", { name: "Eliminar perfil", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "detached" });
  check(
    "profile can be removed without deleting other profiles",
    (await page.locator(".profile-tile").count()) === 3,
  );
  await navigate("operations");
  check(
    "viewer sees administrator access route",
    (await page
      .getByText(
        "El centro operativo está disponible en el perfil Administrador.",
      )
      .isVisible()) && (await page.locator("canvas").count()) === 0,
  );
  await switchTo("Administrador");
  await page.waitForFunction(() =>
    document.querySelector(".metric-value")?.textContent.includes("ms"),
  );
  check(
    "administrator receives real measured HTTP response",
    (await page.locator("canvas").count()) === 2 &&
      (await page.locator("#world-map svg").count()) === 1 &&
      (await page.evaluate(async () => {
        const { telemetry } =
          await import("/js/services/session-telemetry.service.js");
        return (
          telemetry.snapshot.probe.status === 200 &&
          telemetry.snapshot.probe.bytes > 0 &&
          telemetry.snapshot.probe.latency > 0
        );
      })),
  );
  await page.locator("#admin-auto").uncheck();
  await page.getByRole("button", { name: "Medir ahora" }).click();
  await page.waitForFunction(async () => {
    const { telemetry } =
      await import("/js/services/session-telemetry.service.js");
    return telemetry.snapshot.points.length >= 2 && telemetry.snapshot.probe.state === 'ready';
  });
  check(
    "chart compares actual samples",
    await page
      .getByText("Un valor negativo indica menor tiempo de respuesta", {
        exact: false,
      })
      .isVisible(),
  );
  check(
    "external services are correctly unconnected",
    (await page.getByText("Sin conectar", { exact: true }).count()) === 4,
  );
  await navigate("settings");
  await page.locator("#settings-region").selectOption("US");
  await page.locator('button[type="submit"]').click();
  await navigate("operations");
  await page.waitForFunction(async () => {
    const { telemetry } =
      await import("/js/services/session-telemetry.service.js");
    return telemetry.snapshot.regions.US?.samples.length > 0;
  });
  await page.locator("#map-region").selectOption("BO");
  check(
    "world map retains observed regions only",
    await page.evaluate(async () => {
      const { telemetry } =
        await import("/js/services/session-telemetry.service.js");
      return (
        telemetry.snapshot.regions.BO.samples.length > 0 &&
        !telemetry.snapshot.regions.JP
      );
    }),
  );
  const reportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar informe" }).click();
  const report = await reportPromise;
  check(
    "administrator exports actual session report",
    report.suggestedFilename() === "streaming-quality.json",
  );
  await navigate("home");
  check(
    "leaving operations destroys chart and map",
    await page.evaluate(
      () =>
        Object.keys(window.Chart.instances).length === 0 &&
        document.querySelectorAll(".jvm-tooltip").length === 0,
    ),
  );
  await switchTo("Víctor Asturizaga");
  await navigate("player?title=caminandes-2");
  await page.locator(".player-center-play").click();
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video.currentTime > 1 && video.videoWidth > 0 && !video.paused;
  });
  await page.locator(".player-shell").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => document.querySelector("video").currentTime >= 10,
  );
  check(
    "series episode plays and keyboard seeks real media",
    await page
      .locator("video")
      .evaluate(
        (video) =>
          video.duration > 140 &&
          video.duration < 160 &&
          video.currentTime >= 10,
      ),
  );
  await switchTo("Carla Encinas");
  check(
    "switching while playing stores progress in original profile",
    await page.evaluate(() => {
      const preferences = JSON.parse(
        localStorage.getItem("nsip.preferences.v1"),
      );
      return (
        preferences.profileData.victor.playerPreferences.positions[
          "caminandes-2"
        ] >= 10 &&
        !preferences.profileData.carla.playerPreferences?.positions?.[
          "caminandes-2"
        ]
      );
    }),
  );
  await navigate("settings");
  await page.locator("#settings-favorite").selectOption("series");
  await page.locator('button[type="submit"]').click();
  await navigate("home");
  check(
    "home uses explicit individual content preferences",
    (await page
      .getByRole("heading", { name: "Para Carla Encinas" })
      .count()) === 1,
  );
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 45000,
  });
  check(
    "every title has a local source supporting real byte ranges",
    await page.evaluate(async () => {
      const { titles } = await import("/js/data/titles.js");
      const { offlineSource } =
        await import("/js/services/download.service.js");
      const responses = await Promise.all(
        titles.map(async (title) => {
          const source = offlineSource(title),
            response = await fetch(source.url, {
              headers: { Range: "bytes=0-1023" },
            });
          const bytes = await response.arrayBuffer();
          return (
            response.status === 206 &&
            bytes.byteLength === 1024 &&
            response.headers.get("content-range") ===
              `bytes 0-1023/${source.bytes}`
          );
        }),
      );
      return responses.every(Boolean);
    }),
  );
  await navigate("downloads");
  const episode = page.locator('[data-download-id="caminandes-2"]');
  if (await episode.getByRole("button", { name: "Eliminar descarga" }).count())
    await episode.getByRole("button", { name: "Eliminar descarga" }).click();
  await episode.getByRole("button", { name: "Descargar", exact: true }).click();
  await episode
    .getByText("Disponible sin conexión", { exact: true })
    .waitFor({ timeout: 45000 });
  check(
    "episode is fully stored in browser cache",
    await page.evaluate(async () => {
      const response = await (
        await caches.open("netflix-media-v1")
      ).match(
        new URL("assets/videos/caminandes-2-360p.mp4", location.href).href,
      );
      return (
        response?.status === 200 &&
        Number(response.headers.get("content-length")) === 10766640
      );
    }),
  );
  await page.context().setOffline(true);
  try {
    await page.reload();
    await page
      .locator('[data-download-id="caminandes-2"]')
      .getByText("Disponible sin conexión", { exact: true })
      .waitFor();
    check(
      "downloads survive an actual offline page reload",
      await page.locator("#network-status").isVisible(),
    );
    await page
      .locator('[data-download-id="caminandes-2"]')
      .getByRole("button", { name: "Reproducir", exact: true })
      .click();
    await page.locator(".player-center-play").click();
    await page.waitForFunction(
      () => {
        const video = document.querySelector("video");
        return video.currentTime > 1 && video.videoWidth > 0 && !video.paused;
      },
      null,
      { timeout: 45000 },
    );
    check(
      "cached series episode actually decodes and plays offline",
      (await page
        .locator("video")
        .evaluate((video) => video.error === null && video.videoHeight > 0)) &&
        (await page.locator("#player-quality").isDisabled()),
    );
    await page.locator(".player-shell").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.querySelector("video").currentTime >= 10,
    );
    check(
      "offline byte ranges allow seeking",
      await page.locator("video").evaluate((video) => video.currentTime >= 10),
    );
  } finally {
    await page.context().setOffline(false);
  }
  await navigate("downloads");
  await page
    .locator('[data-download-id="caminandes-2"]')
    .getByRole("button", { name: "Eliminar descarga" })
    .click();
  await page
    .locator('[data-download-id="caminandes-2"]')
    .getByRole("button", { name: "Descargar", exact: true })
    .waitFor();
  check(
    "download removal frees cached media",
    await page.evaluate(
      async () =>
        !(await (
          await caches.open("netflix-media-v1")
        ).match(
          new URL("assets/videos/caminandes-2-360p.mp4", location.href).href,
        )),
    ),
  );
  await navigate("home");
  await page.reload();
  await page.locator(".cinema-intro").waitFor();
  check(
    "refresh starts cinematic N and colored-beam sequence",
    (await page.locator(".intro-n span").count()) === 3 &&
      (await page.locator(".intro-beams i").count()) === 36 &&
      (await page.locator("#app").getAttribute("inert")) === "",
  );
  await page.evaluate(() => {
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor(...args) {
        super(...args);
        window.__introAudio = this;
      }
    };
  });
  await page
    .getByRole("button", { name: /^(Repetir con sonido|Activar sonido)$/ })
    .click();
  check(
    "sound replay restarts intro after user interaction",
    await page.locator(".cinema-intro").isVisible(),
  );
  await page.waitForFunction(
    () =>
      window.__introAudio?.state === "running" &&
      window.__introAudio.currentTime > 0.02,
  );
  check(
    "intro audio runs after a real user gesture",
    await page.evaluate(
      () =>
        window.__introAudio.currentTime > 0 &&
        window.__introAudio.state === "running",
    ),
  );
  await page.keyboard.press("Escape");
  await page.locator(".cinema-intro").waitFor({ state: "detached" });
  check(
    "Escape skips intro and releases main content",
    !(await page.locator("#app").getAttribute("inert")),
  );
  check(
    "skipping intro releases audio resources",
    await page.evaluate(() => window.__introAudio.state === "closed"),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  check(
    "reduced motion bypasses intro",
    (await page.locator(".cinema-intro").count()) === 0,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await navigate("profiles");
  await page.locator("#app").evaluate((node) =>
    Promise.all(
      node
        .getAnimations({ subtree: true })
        .filter(
          (animation) => animation.effect.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished),
    ),
  );
  await page.screenshot({
    path: "output/playwright/profiles-new.png",
    fullPage: true,
  });
  await switchTo("Administrador");
  await page.waitForFunction(() =>
    document.querySelector(".metric-value")?.textContent.includes("ms"),
  );
  await page
    .locator("#app")
    .evaluate((node) =>
      Promise.all(node.getAnimations().map((animation) => animation.finished)),
    );
  await page.screenshot({
    path: "output/playwright/admin-new.png",
    fullPage: true,
  });
  await switchTo("Víctor Asturizaga");
  return {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failures: results.filter((result) => !result.pass),
    errors,
    failedRequests,
  };
}
