import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const policy = JSON.parse(
  readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8"),
);
for (const width of [1280, 390])
  test(`journey separates offchain records from verified state and fails closed at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    let failed = false;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/session"))
        return route.fulfill({ json: { accountId: policy.ownerAccount } });
      if (path.endsWith("/assignments"))
        return route.fulfill({ json: { mandates: [policy] } });
      if (failed) return route.abort();
      return route.fulfill({
        json: {
          policy,
          onchain: null,
          block: null,
          intents: [
            {
              id: "synthetic",
              state: "UNKNOWN",
              operation: { methodName: "authorize_and_execute" },
              explorerUrl: null,
            },
          ],
          proposals: [{ proposalId: "synthetic" }],
        },
      });
    });
    await page.goto("/workspace/journey");
    await page.getByLabel("Journey mandate").selectOption(policy.mandateId);
    await expect(
      page.getByText("No verified onchain state loaded.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("1 offchain proposal(s) loaded", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Outcome unresolved. Do not repeat this operation."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Inspect verified transaction" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "Original owner: review and execute an eligible payment",
      }),
    ).toHaveAttribute(
      "href",
      `/workspace/settlement?mandate=${policy.mandateId}`,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    failed = true;
    await page.getByRole("button", { name: "Refresh journey state" }).click();
    await expect(page.getByRole("status")).toContainText(
      "No completion is inferred",
    );
    await expect(
      page.getByText("1 offchain proposal(s) loaded", { exact: false }),
    ).toHaveCount(0);
  });
test("signed-out journey does not imply organization or chain access", async ({
  page,
}) => {
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 401, json: { error: "AUTH_REQUIRED" } }),
  );
  await page.goto("/workspace/journey");
  await expect(page.getByRole("status")).toContainText("Sign in");
  await expect(page.getByLabel("Journey mandate")).toHaveCount(0);
});

test("journey refuses a mismatched tenant/policy response", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session"))
      return route.fulfill({ json: { accountId: policy.ownerAccount } });
    if (path.endsWith("/assignments"))
      return route.fulfill({ json: { mandates: [policy] } });
    return route.fulfill({
      json: {
        policy: { ...policy, organizationId: "other-tenant" },
        onchain: null,
        block: null,
        intents: [],
        proposals: [],
      },
    });
  });
  await page.goto("/workspace/journey");
  await page.getByLabel("Journey mandate").selectOption(policy.mandateId);
  await expect(page.getByRole("status")).toContainText("binding mismatch");
  await expect(
    page.getByText("No verified onchain state loaded.", { exact: false }),
  ).toBeVisible();
});
