// Run via playwright-cli run-code --filename scripts/qa-layout.cjs (not node directly).
async (page) => {
  const errors = [],
    failedRequests = [],
    results = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      failedRequests.push(`${response.status()} ${response.url()}`);
  });
  const base = "http://127.0.0.1:4173/";
  await page.goto(`${base}#/settings`);
  await page.evaluate(() => {
    const preferences = JSON.parse(
      localStorage.getItem("nsip.preferences.v1") || "{}",
    );
    localStorage.setItem(
      "nsip.preferences.v1",
      JSON.stringify({ ...preferences, selectedProfile: "administrator" }),
    );
  });
  await page.reload();
  const navigate = async (route) => {
    await page.goto(`${base}#/${route}`);
    await page.waitForFunction(
      (expected) => document.getElementById("app").dataset.route === expected && !document.documentElement.classList.contains('route-transition'),
      route.split('?')[0],
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
  const viewports = [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
  ];
  for (const language of ["es", "en", "it", "ar"]) {
    await navigate("settings");
    await page.locator("#settings-language").selectOption(language);
    await page.locator("#settings-region").selectOption("US");
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(
      (code) => document.documentElement.lang === code,
      language,
    );
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const route of [
        "home",
        "series",
        "settings",
        "account",
        "profiles",
        "downloads",
        "player",
        "operations",
        "title?title=caminandes-2",
      ]) {
        await navigate(route);
        const state = await page.evaluate(() => {
          const ids = [...document.querySelectorAll("[id]")].map(
            (node) => node.id,
          );
          const controls = [
            ...document.querySelectorAll("input,select,button"),
          ].filter((node) => node.getClientRects().length);
          const unnamed = controls
            .filter(
              (node) =>
                !node.getAttribute("aria-label") &&
                !node.getAttribute("aria-labelledby") &&
                !node.textContent.trim() &&
                !node.closest("label") &&
                !document.querySelector(`label[for="${node.id}"]`),
            )
            .map((node) => node.outerHTML.slice(0, 120));
          const h1 = document.querySelector("main h1");
          const headingOverflows =
            !!h1 &&
            !h1.classList.contains("sr-only") &&
            h1.scrollWidth > h1.clientWidth + 1;
          const clippedControls = [
            ...document.querySelectorAll(
              "header a,header button,.card-actions button",
            ),
          ]
            .filter((node) => node.getClientRects().length)
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              const card = node.closest(".movie-card")?.getBoundingClientRect();
              return (
                rect.left < -1 ||
                rect.right > innerWidth + 1 ||
                (card &&
                  (rect.left < card.left - 1 || rect.right > card.right + 1))
              );
            })
            .map((node) => node.getAttribute("aria-label"));
          const mobile = window.innerWidth < 1200;
          return {
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            overflow:
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth + 1,
            duplicates: ids.length !== new Set(ids).size,
            unnamed,
            headingOverflows,
            clippedControls,
            forbidden:
              /\bdemo\b|Prototipo académico|No es un producto oficial de Netflix/i.test(
                document.body.innerText,
              ),
            heading: h1?.textContent,
            navVisible: !!document
              .querySelector(mobile ? ".menu-toggle" : ".desktop-nav")
              ?.getClientRects().length,
            chart:
              !document.querySelector("canvas") ||
              !!window.Chart.getChart(document.querySelector("canvas")),
            map:
              !document.getElementById("world-map") ||
              !!document.querySelector("#world-map svg"),
          };
        });
        const pass =
          !state.overflow &&
          !state.duplicates &&
          !state.forbidden &&
          !state.unnamed.length &&
          !state.headingOverflows &&
          !state.clippedControls.length &&
          !!state.heading &&
          state.navVisible &&
          state.chart &&
          state.map &&
          state.dir === (language === "ar" ? "rtl" : "ltr");
        results.push({ language, width, height, route, pass, ...state });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await navigate("home");
    await page
      .locator("#app")
      .evaluate((node) =>
        Promise.all(
          node.getAnimations().map((animation) => animation.finished),
        ),
      );
    await page.screenshot({
      path: `output/playwright/home-${language}-390.png`,
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await navigate("operations");
  await page
    .locator("#app")
    .evaluate((node) =>
      Promise.all(node.getAnimations().map((animation) => animation.finished)),
    );
  await page.screenshot({
    path: "output/playwright/operations-ar-desktop.png",
    fullPage: true,
  });
  await navigate("settings");
  await page.locator("#settings-language").selectOption("es");
  await page.locator("#settings-region").selectOption("BO");
  await page.locator('button[type="submit"]').click();
  await navigate("home");
  await page
    .locator("#app")
    .evaluate((node) =>
      Promise.all(node.getAnimations().map((animation) => animation.finished)),
    );
  await page.screenshot({
    path: "output/playwright/home-es-desktop.png",
    fullPage: false,
  });
  return {
    total: results.length,
    passed: results.filter((row) => row.pass).length,
    failures: results.filter((row) => !row.pass),
    errors,
    failedRequests,
  };
}
