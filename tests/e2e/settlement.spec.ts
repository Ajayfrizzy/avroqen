import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const policy = JSON.parse(
  readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8"),
);
for (const mobile of [false, true])
  test(`settlement remains disabled and separates offchain terms from chain balances (${mobile ? "mobile" : "desktop"})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session")
        return route.fulfill({
          json: { accountId: policy.ownerAccount, csrfToken: "fixture" },
        });
      if (path === "/api/chain/assignments")
        return route.fulfill({ json: { mandates: [policy] } });
      if (path === "/api/chain/status")
        return route.fulfill({
          json: { status: "NOT_AUTHORIZED", submissionEnabled: false },
        });
      if (path.endsWith("/chain"))
        return route.fulfill({
          json: {
            policy,
            onchain: null,
            block: null,
            intents: [],
            proposals: [],
            reviews: [],
          },
        });
      return route.fulfill({ status: 403, json: { error: "ACCESS_DENIED" } });
    });
    await page.goto("/workspace/settlement");
    await page
      .getByRole("combobox", { name: "Mandate", exact: true })
      .selectOption(policy.mandateId);
    await expect(
      page.getByText("Live submission disabled.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("No verified onchain mandate state available.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Prepare exact operation" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "View verified transaction" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
test("unknown operation warns against retry and has no unverified explorer link", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session"))
      return route.fulfill({
        json: { accountId: policy.ownerAccount, csrfToken: "fixture" },
      });
    if (path.endsWith("/assignments"))
      return route.fulfill({ json: { mandates: [policy] } });
    if (path.endsWith("/status"))
      return route.fulfill({
        json: { status: "UNAVAILABLE", submissionEnabled: false },
      });
    return route.fulfill({
      json: {
        policy,
        onchain: null,
        block: null,
        proposals: [],
        reviews: [],
        intents: [
          {
            id: "fixture",
            state: "UNKNOWN",
            reason: "RPC_OR_EVIDENCE_UNAVAILABLE",
            operation: { methodName: "authorize_and_execute" },
            explorerUrl: null,
          },
        ],
      },
    });
  });
  await page.goto("/workspace/settlement");
  await page
    .getByRole("combobox", { name: "Mandate", exact: true })
    .selectOption(policy.mandateId);
  await expect(
    page.getByText(
      "Do not repeat this operation while its outcome is unresolved.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View verified transaction" }),
  ).toHaveCount(0);
});
