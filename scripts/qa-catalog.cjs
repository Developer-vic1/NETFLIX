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
    await page.waitForFunction(expected => document.querySelector('#app').dataset.route === expected && !document.documentElement.classList.contains('route-transition'), route.split('?')[0]);
  };
  await navigate('home');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#catalog-content article").first().waitFor();
  check(
    "exact home URL renders nine real titles without error panel",
    (await page.locator("#catalog-content article").count()) === 9 &&
      !(await page
        .getByText("No fue posible cargar la interfaz. Reintenta.", {
          exact: true,
        })
        .count()),
  );
  check(
    "catalog requires no legacy title.number field",
    await page.evaluate(async () => {
      const { titles } = await import("/js/data/titles.js");
      return titles.every(
        (title) =>
          !("number" in title) &&
          title.name &&
          title.poster &&
          title.qualities.length,
      );
    }),
  );
  await page
    .getByRole("button", { name: "Más información", exact: true })
    .click();
  check(
    "real title details open",
    (await page.locator("main h1").textContent()) === "Sintel" &&
      (await page.locator('.title-information').count()) === 1,
  );
  await navigate('home');
  await page.locator("#catalog-search").fill("Spring");
  await page.waitForFunction(
    () =>
      document.querySelector("#catalog-content").dataset.searchState ===
        "results" &&
      document.querySelectorAll("#catalog-content article").length === 1,
  );
  check(
    "search reads real title names",
    (await page.locator("#catalog-content h3").textContent()) === "Spring",
  );
  await page.locator("#catalog-search").fill("nonexistent-title");
  await page.waitForFunction(
    () =>
      document.querySelector("#catalog-content").dataset.searchState ===
      "no-results",
  );
  check(
    "empty search keeps interface available",
    (await page.locator("#catalog-content .state").count()) === 1,
  );
  await navigate('player?title=sintel');
  await page.locator(".player-center-play").click();
  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return (
        video && !video.paused && video.currentTime > 1 && video.videoWidth > 0
      );
    },
    null,
    { timeout: 45000 },
  );
  check(
    "Sintel plays actual decoded video",
    await page
      .locator("video")
      .evaluate(
        (video) =>
          video.error === null && video.duration > 800 && video.videoHeight > 0,
      ),
  );
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  check(
    "pause controls actual media",
    await page
      .locator("video")
      .evaluate((video) => video.paused && video.currentTime > 1),
  );
  await page.locator("video").evaluate((video) => {
    video.currentTime = 30;
  });
  await page.waitForFunction(
    () => document.querySelector("video").currentTime >= 29,
  );
  check(
    "seeking advances actual media position",
    await page.locator("video").evaluate((video) => video.currentTime >= 29),
  );
  await navigate('home');
  check(
    "return from playback restores home without render failure",
    (await page.locator("#catalog-content article").count()) === 9,
  );
  for (const language of ["es", "en", "it", "ar"]) {
    await page.evaluate((language) => {
      localStorage.setItem(
        "nsip.preferences.v1",
        JSON.stringify({ language, region: "BO" }),
      );
    }, language);
    await page.reload();
    await page.locator("#catalog-content article").first().waitFor();
    check(
      `${language}: real catalog renders after reload`,
      (await page.locator("#catalog-content article").count()) === 9,
    );
    check(
      `${language}: no demo/disclaimer or fatal error on home`,
      !/\bdemo\b|Prototipo académico|No fue posible cargar la interfaz/.test(
        await page.locator("body").innerText(),
      ),
    );
    for (const route of [
      "series",
      "movies",
      "new",
      "my-list",
      "search",
      "settings",
      "account",
      "player",
      "operations",
    ]) {
      await navigate(route);
      check(
        `${language}: ${route} renders without fatal error`,
        !(await page
          .getByText("No fue posible cargar la interfaz. Reintenta.", {
            exact: true,
          })
          .count()) && (await page.locator("main h1").count()) === 1,
      );
    }
    await navigate('home');
  }
  await page.evaluate(() =>
    localStorage.setItem(
      "nsip.preferences.v1",
      JSON.stringify({ language: "es", region: "BO" }),
    ),
  );
  await page.reload();
  await page.screenshot({
    path: "output/playwright/home-fixed.png",
    fullPage: true,
  });
  return {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failures: results.filter((result) => !result.pass),
    errors,
    failedRequests,
  };
}
