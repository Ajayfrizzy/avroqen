import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  type Mode,
  openScreen,
  orgId,
  policy,
  routes,
  uiFixture,
} from "../support/ui-fixtures";

for (const width of [1440, 768, 390, 320])
  for (const screen of routes)
    test(`design system ${screen}: ${width}px, accessible populated state`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await uiFixture(page);
      await openScreen(page, screen);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      if (process.env.CAPTURE_UI === "true" && [1440, 390].includes(width)) {
        await mkdir("docs/evidence/ui", { recursive: true });
        await page.evaluate(() => {
          const note = document.createElement("div");
          note.textContent =
            "BROWSER FIXTURE · SYNTHETIC DATA · NOT LIVE FINANCIAL EVIDENCE";
          note.style.cssText =
            "background:#102638;color:white;text-align:center;padding:8px;font:10px sans-serif";
          document.body.prepend(note);
        });
        await page.screenshot({
          path: `docs/evidence/ui/${screen}-${width}.png`,
          fullPage: true,
        });
      }
    });
for (const mode of ["signed-out", "empty", "error", "loading"] as Mode[])
  for (const screen of routes)
    test(`${screen}: honest ${mode} state`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const release = await uiFixture(page, mode);
      await openScreen(page, screen, mode);
      await expect(page.locator("main h1")).toBeVisible();
      if (mode === "loading")
        await expect(page.locator("main")).toContainText(/Loading|Checking/);
      if (mode === "error")
        await expect(page.locator("main")).toContainText(
          /unavailable|Unable|Sign in|could not|No organizations|unavailable/i,
        );
      if (mode === "signed-out")
        await expect(page.locator("main")).toContainText(
          /Sign in|sign-in|Connect|No organizations/i,
        );
      await expect(
        page.getByRole("button", { name: "Open wallet and authorize" }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      release();
    });
test("mobile drawer traps keyboard focus, closes on Escape and restores trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uiFixture(page);
  await openScreen(page, "wallet");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toHaveCSS("opacity", "0");
  await skip.focus();
  await expect(skip).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace-content")).toBeFocused();
  await expect(skip).toHaveCSS("opacity", "0");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Avroqen navigation" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(/journey/);
  await expect(dialog).not.toBeVisible();
});
test("wizard validates each step, retains exact input and never creates a policy before review", async ({
  page,
}) => {
  await uiFixture(page);
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") writes++;
  });
  await openScreen(page, "mandates");
  await page.getByRole("button", { name: "Create a draft" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("#task")).toBeFocused();
  await page.locator("#task").fill("Exact test policy");
  await page.locator("#vault").fill(policy.vaultAccount);
  await page.locator("#recipient").fill(policy.recipient);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Step 2 of 5/ }),
  ).toBeFocused();
  await page.locator("#per").fill("0.000000000000000000000001");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator("#task")).toHaveValue("Exact test policy");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("#per")).toHaveValue("0.000000000000000000000001");
  expect(writes).toBe(0);
});
test("overview clears organization observations before another tenant loads", async ({
  page,
}) => {
  await uiFixture(page);
  await openScreen(page, "overview");
  await expect(
    page.getByText("Northstar Studio", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Organization", exact: true })
    .selectOption("");
  await expect(
    page.getByRole("heading", { name: "Cloud infrastructure", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Organization data unavailable", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Organization", exact: true })
    .selectOption(orgId);
  await expect(
    page.getByRole("heading", { name: "Cloud infrastructure", exact: true }),
  ).toBeVisible();
});

for (const width of [1440, 390])
  for (const state of [
    "sign-in",
    "mandate-wizard",
    "evidence-document",
  ] as const)
    test(`guided ${state} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await uiFixture(page, state === "sign-in" ? "signed-out" : "populated");
      await openScreen(
        page,
        state === "sign-in"
          ? "wallet"
          : state === "mandate-wizard"
            ? "mandates"
            : "verification",
        state === "sign-in" ? "signed-out" : "populated",
      );
      if (state === "mandate-wizard") {
        await page.getByRole("button", { name: "Create a draft" }).click();
        await expect(page.locator("#task")).toBeVisible();
      }
      if (state === "evidence-document") {
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .click();
        await expect(
          page.getByLabel("Optional: hash a local document", { exact: false }),
        ).toBeVisible();
      }
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (process.env.CAPTURE_UI === "true") {
        await mkdir("docs/evidence/ui", { recursive: true });
        await page.evaluate(() => {
          const note = document.createElement("div");
          note.textContent =
            "BROWSER FIXTURE · SYNTHETIC DATA · NOT LIVE FINANCIAL EVIDENCE";
          note.style.cssText =
            "background:#102638;color:white;text-align:center;padding:8px;font:10px sans-serif";
          document.body.prepend(note);
        });
        await page.screenshot({
          path: `docs/evidence/ui/${state}-${width}.png`,
          fullPage: true,
        });
      }
    });

test("topbar logout waits for server invalidation, preserves session on failure and clears on success", async ({
  page,
}) => {
  await uiFixture(page);
  let fail = true,
    signedOut = false;
  await page.route("**/api/auth/session", async (route) => {
    if (signedOut)
      return route.fulfill({ status: 401, json: { error: "AUTH_REQUIRED" } });
    return route.fallback();
  });
  await page.route("**/api/auth/logout", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe(
      "synthetic-ui-fixture",
    );
    if (fail)
      return route.fulfill({ status: 503, json: { error: "UNAVAILABLE" } });
    signedOut = true;
    return route.fulfill({ json: { ok: true } });
  });
  await openScreen(page, "wallet");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".shell-error")).toContainText(
    "Could not sign out",
  );
  await expect(
    page.getByRole("heading", { name: /Signed in as/ }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Connect wallet & sign message" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`saved organization persists across routes and refresh at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await uiFixture(page);
    await page.goto("/workspace");
    await expect(page.locator(".account-pill")).not.toContainText(
      "Select organization",
    );
    await expect(page.getByRole("link", { name: "Open overview" })).toHaveCount(
      0,
    );
    await page
      .getByLabel("Select organization", { exact: true })
      .selectOption(orgId);
    await page
      .getByRole("button", { name: "Save organization", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Organization saved");
    await expect(
      page.getByRole("button", { name: "✓ Saved", exact: true }),
    ).toBeDisabled();
    for (const [path, selector] of [
      ["/workspace/proposals", "#proposal-org"],
      ["/workspace/mandates", "#mandate-organization"],
      ["/workspace", "#organization"],
    ] as const) {
      await page.goto(path);
      if (path === "/workspace/proposals")
        await page.getByRole("tab", { name: "Organization mandates" }).click();
      const selection =
        path === "/workspace/mandates"
          ? page.getByRole("combobox").first()
          : page.locator(selector);
      await expect(selection).toHaveValue(orgId);
      await page.reload();
      await expect(selection).toHaveValue(orgId);
      if (path === "/workspace/proposals")
        await expect(
          page.getByRole("tab", { name: "Organization mandates" }),
        ).toHaveAttribute("aria-selected", "true");
      if (path === "/workspace")
        await expect(
          page.getByRole("button", { name: "✓ Saved", exact: true }),
        ).toBeDisabled();
      if (path === "/workspace/proposals")
        await expect(
          page.getByRole("button", { name: "Logout", exact: true }),
        ).toHaveCount(0);
    }
    await page.evaluate(() =>
      localStorage.setItem(
        "avroqen:testnet:organization:owner.testnet",
        "unauthorized-org",
      ),
    );
    await page.reload();
    await expect(page.locator("#organization")).toHaveValue("");
    await page.evaluate(
      (id) =>
        localStorage.setItem("avroqen:testnet:organization:owner.testnet", id),
      orgId,
    );
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        json: {
          accountId: "other.testnet",
          network: "testnet",
          csrfToken: "synthetic-other",
          expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        },
      }),
    );
    await page.reload();
    await expect(page.locator("#organization")).toHaveValue("");
  });
}

test("wallet sign-in displays a spinner while the challenge is pending", async ({
  page,
}) => {
  await uiFixture(page, "signed-out");
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/challenge", async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { error: "UNAVAILABLE" } });
  });
  await page.goto("/workspace");
  await page.getByLabel("NEAR account", { exact: true }).fill("owner.testnet");
  await page
    .getByRole("button", { name: "Connect wallet & sign message" })
    .click();
  const pending = page.getByRole("button", { name: "Waiting for wallet…" });
  await expect(pending).toBeDisabled();
  await expect(pending.locator(".button-spinner")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(pending.locator(".button-spinner")).toHaveCSS(
    "animation-name",
    "none",
  );
  release();
  await expect(
    page.getByRole("button", { name: "Connect wallet & sign message" }),
  ).toBeEnabled();
});
