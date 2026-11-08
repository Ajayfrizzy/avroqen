import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  SAMPLE,
  SAMPLE_NOTICE,
  SAMPLE_ROUTES,
} from "../../apps/web/app/demo/sample-data";

async function isolate(page: Page) {
  const violations: string[] = [];
  page.on("popup", () => violations.push("popup"));
  page.on("worker", () => violations.push("worker"));
  page.on("websocket", () => violations.push("websocket"));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== "http://127.0.0.1:3000" ||
      !(
        url.pathname === "/demo" ||
        url.pathname.startsWith("/demo/") ||
        url.pathname.startsWith("/_next/") ||
        url.pathname === "/favicon.ico"
      )
    ) {
      violations.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    const attempts: string[] = [];
    Object.defineProperty(window, "sampleAttempts", { value: attempts });
    const block = (name: string) => () => {
      attempts.push(name);
      throw new Error("Prohibited SAMPLE capability");
    };
    for (const method of ["setItem", "removeItem", "clear"])
      Object.defineProperty(Storage.prototype, method, {
        value: block(`storage.${method}`),
      });
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "cookie",
    );
    if (descriptor)
      Object.defineProperty(Document.prototype, "cookie", {
        configurable: true,
        get: block("cookie.read"),
        set: block("cookie.write"),
      });
    for (const property of ["meteorCom", "meteorComV2", "near", "ethereum"])
      Object.defineProperty(window, property, {
        get: block(`wallet.${property}`),
      });
    navigator.sendBeacon = block("beacon");
    indexedDB.open = block("indexedDB");
  });
  return async () => {
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { sampleAttempts: string[] }).sampleAttempts,
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
    ).toEqual([0, 0]);
  };
}

for (const route of SAMPLE_ROUTES) {
  test(`SAMPLE route ${route.path}: isolated, accessible, identical with synthetic-cookie context`, async ({
    browser,
  }) => {
    let baseline = "";
    for (const withSyntheticCookie of [false, true]) {
      const context = await browser.newContext({ reducedMotion: "reduce" });
      if (withSyntheticCookie)
        await context.addCookies([
          {
            name: "avroqen_session",
            value: "SYNTHETIC_ONLY",
            url: "http://127.0.0.1:3000",
          },
        ]);
      const page = await context.newPage();
      const check = await isolate(page);
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(`${route.title} — SAMPLE demo | Avroqen`);
      await page.reload();
      await expect(page).toHaveTitle(`${route.title} — SAMPLE demo | Avroqen`);
      expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
      await expect(
        page.getByText(SAMPLE_NOTICE, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("No network connected", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(
        page
          .getByRole("navigation", { name: "SAMPLE steps" })
          .locator('[aria-current="page"]'),
      ).toHaveText(route.title);
      for (const card of await page.locator(".sample-card").all())
        await expect(
          card.locator(".status-badge").filter({ hasText: /^SAMPLE$/ }),
        ).toBeVisible();
      await expect(page.locator("form, input, iframe")).toHaveCount(0);
      const text = (await page.locator("main").textContent()) ?? "";
      expect(text).not.toMatch(
        /SYNTHETIC_ONLY|ed25519:|avroqen-vault\.testnet|[1-9A-HJ-NP-Za-km-z]{43,44}/,
      );
      expect(text).not.toMatch(
        /(?:payment complete|successfully paid|payment succeeded)/i,
      );
      if (withSyntheticCookie) expect(text).toBe(baseline);
      else baseline = text;
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect((await context.cookies()).map((c) => [c.name, c.value])).toEqual(
        withSyntheticCookie ? [["avroqen_session", "SYNTHETIC_ONLY"]] : [],
      );
      await check();
      await context.close();
    }
  });
}

test("all six pages work without JavaScript and preserve exact scenario data", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  for (const route of SAMPLE_ROUTES) {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByText(SAMPLE_NOTICE, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "SAMPLE steps" }),
    ).toBeVisible();
  }
  await page.goto("/demo/mandate");
  await expect(page.getByText("0.10 NEAR", { exact: true })).toBeVisible();
  await expect(page.getByText("0.05 NEAR", { exact: true })).toBeVisible();
  await page.getByText("Exact atomic units", { exact: true }).click();
  await expect(
    page.getByText(SAMPLE.mandate.totalAtomic, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Next: Agent proposal" }).click();
  await expect(page).toHaveURL(/\/demo\/proposal$/);
  await expect(page.getByText("0.04 NEAR", { exact: true })).toBeVisible();
  await page.goto("/demo/outcomes");
  await expect(page.getByText("0.07 NEAR", { exact: true })).toBeVisible();
  for (const proposal of SAMPLE.proposals)
    await expect(
      page.getByText(proposal.explanation, { exact: true }),
    ).toBeVisible();
  await context.close();
});

for (const width of [320, 390, 768, 1440]) {
  test(`responsive keyboard journey at ${width}px`, async ({
    page,
  }, testInfo) => {
    const check = await isolate(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of SAMPLE_ROUTES) {
      await page.goto(route.path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await page.locator(".sample-topbar .brand").boundingBox())?.height,
      ).toBeGreaterThanOrEqual(44);
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("link", { name: "Skip to SAMPLE content" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#demo-content")).toBeFocused();
      await expect(
        page.getByText(SAMPLE_NOTICE, { exact: true }),
      ).toBeInViewport();
    }
    await page.getByRole("link", { name: "Previous: Outcomes" }).click();
    await expect(page).toHaveURL(/\/demo\/outcomes$/);
    const cards = page.locator(".sample-grid > .sample-card");
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    if (!first || !second) throw new Error("Missing comparison cards");
    if (width === 1440) expect(Math.abs(first.y - second.y)).toBeLessThan(1);
    else expect(second.y).toBeGreaterThan(first.y);
    const summary = cards.nth(0).locator(".review-summary").first();
    expect(
      await summary.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    ).toBe(width === 1440 ? 2 : 1);
    for (const card of await cards.all()) {
      await expect(
        card.getByText("Not authorized — owner approval required", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        card.getByText("Not submitted — no payment made", { exact: true }),
      ).toBeVisible();
    }
    await cards
      .nth(0)
      .getByText("Exact proposal terms", { exact: true })
      .click();
    for (const code of [
      "WITHIN_SAMPLE_POLICY",
      "NOT_GRANTED",
      "ILLUSTRATIVE_ONLY",
      "NOT_SUBMITTED",
    ])
      await expect(cards.nth(0).getByText(code, { exact: true })).toBeVisible();
    // Narrow a card independently of viewport width: its summaries must stack.
    if (width === 1440) {
      await cards.nth(0).evaluate((el) => {
        (el as HTMLElement).style.width = "300px";
      });
      expect(
        await summary.evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
      ).toBe(1);
      await cards.nth(0).evaluate((el) => {
        (el as HTMLElement).style.removeProperty("width");
      });
    }
    await cards
      .nth(0)
      .getByText("Exact proposal terms", { exact: true })
      .click();
    await check();
    await page.screenshot({
      path: testInfo.outputPath(`sample-outcomes-${width}.png`),
      fullPage: true,
    });
  });
}

test("URL selectors cannot choose live data; unknown steps return HTTP 404", async ({
  page,
}) => {
  const check = await isolate(page);
  for (const route of SAMPLE_ROUTES) {
    await page.goto(route.path);
    const baseline = await page.locator("main").textContent();
    await page.goto(
      `${route.path}?account=REAL_SENTINEL&network=mainnet&url=https%3A%2F%2Finvalid.example&mode=live`,
    );
    expect(await page.locator("main").textContent()).toBe(baseline);
  }
  for (const path of [
    "/demo/live",
    "/demo/mandate/extra",
    "/demo/%61ccount",
    "/demo/%3Fnetwork=mainnet",
  ])
    expect((await page.goto(path))?.status()).toBe(404);
  await check();
});

test("landing exposes SAMPLE separately from the existing workspace", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Explore SAMPLE demo" }),
  ).toHaveAttribute("href", "/demo");
  await expect(
    page.getByRole("link", { name: "Open your workspace" }),
  ).toHaveAttribute("href", "/workspace/journey");
});
