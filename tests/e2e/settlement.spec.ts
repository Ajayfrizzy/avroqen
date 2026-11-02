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
test("late chain state from a previous mandate cannot replace the current review", async ({
  page,
}) => {
  const second = {
    ...policy,
    mandateId: "77777777-7777-4777-8777-777777777777",
    taskReference: "Second mandate",
  };
  let release: () => void = () => {};
  const wait = new Promise<void>((r) => {
    release = r;
  });
  let oldRequested = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session"))
      return route.fulfill({
        json: { accountId: policy.ownerAccount, csrfToken: "fixture" },
      });
    if (path.endsWith("/assignments"))
      return route.fulfill({ json: { mandates: [policy, second] } });
    if (path.endsWith("/status"))
      return route.fulfill({
        json: { status: "NOT_AUTHORIZED", submissionEnabled: false },
      });
    const old = path.includes(policy.mandateId);
    if (old) {
      oldRequested = true;
      await wait;
    }
    return route.fulfill({
      json: {
        policy: old ? policy : second,
        onchain: null,
        block: null,
        proposals: [],
        reviews: [],
        intents: old
          ? [
              {
                id: "stale",
                state: "UNKNOWN",
                reason: "STALE_RESPONSE_MUST_NOT_APPEAR",
                operation: { methodName: "fund_mandate" },
              },
            ]
          : [],
      },
    });
  });
  await page.goto("/workspace/settlement");
  await page
    .getByRole("combobox", { name: "Mandate", exact: true })
    .selectOption(policy.mandateId);
  await expect.poll(() => oldRequested).toBe(true);
  await page
    .getByRole("combobox", { name: "Mandate", exact: true })
    .selectOption(second.mandateId);
  await expect(
    page.getByRole("heading", { name: "Second mandate" }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("No blockchain operations prepared."),
  ).toBeVisible();
  await expect(
    page.getByText("STALE_RESPONSE_MUST_NOT_APPEAR", { exact: false }),
  ).toHaveCount(0);
});
test("tampered prepared transaction cannot reach a wallet prompt", async ({
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
        json: { status: "VERIFIED", submissionEnabled: true },
      });
    if (path.endsWith("/intents"))
      return route.fulfill({
        json: {
          id: "fixture",
          state: "PREPARED",
          operation: { receiverId: "attacker.testnet" },
        },
      });
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
  });
  await page.goto("/workspace/settlement");
  await page
    .getByRole("combobox", { name: "Mandate", exact: true })
    .selectOption(policy.mandateId);
  await page
    .getByRole("textbox", { name: "Storage spending ceiling (NEAR)" })
    .fill("0.1");
  await page.getByRole("button", { name: "Prepare exact operation" }).click();
  await expect(
    page.getByText("Prepared transaction does not match the reviewed terms.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open wallet and authorize" }),
  ).toHaveCount(0);
});
