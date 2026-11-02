import { expect, type Page, test } from "@playwright/test";

const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333",
  mandate = "44444444-4444-4444-8444-444444444444";
async function fixture(
  page: Page,
  { readonly = false, offline = false, empty = false } = {},
) {
  let state = "OPEN",
    version = 1;
  const alert = () => ({
    id,
    rule: "SPENDING_LIMIT",
    severity: "HIGH",
    classification: "POLICY_REJECTION",
    explanation:
      "The application rejected an amount above the mandate payment limit. No payment is implied.",
    mandate_id: mandate,
    subject: "agent.testnet",
    state,
    version,
    occurrences: 1,
    first_observed: new Date().toISOString(),
    last_observed: new Date().toISOString(),
    assigned_account: null,
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({
        json: { accountId: "owner.testnet", csrfToken: "fixture" },
      });
    if (path === "/api/organizations")
      return route.fulfill({
        json: {
          organizations: [
            { id: org, name: "One", role: readonly ? "viewer" : "owner" },
            { id: other, name: "Two", role: "viewer" },
          ],
        },
      });
    if (path.includes(`/${other}/`))
      return route.fulfill({ status: 403, json: { error: "ACCESS_DENIED" } });
    if (path.endsWith("/agents"))
      return route.fulfill({
        json: {
          agents: [
            { id: "agent-record", name: "Demo agent", disabledAt: null },
          ],
        },
      });
    if (path.endsWith("/credentials"))
      return route.fulfill({ json: { credentials: [] } });
    if (path.endsWith("/security")) {
      if (offline) return route.abort();
      return route.fulfill({
        json: {
          alerts: empty ? [] : [alert()],
          counts: empty ? [] : [{ severity: "HIGH", count: 1 }],
          settlements: [{ state: "UNKNOWN", count: 1 }],
          health: [],
          canRespond: !readonly,
          nextOffset: null,
          notification: "DASHBOARD_ONLY",
        },
      });
    }
    if (path.endsWith(`/security/${id}`)) {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        state = input.state;
        version++;
        return route.fulfill({
          json: { alert: alert(), financialStateChanged: false },
        });
      }
      return route.fulfill({
        json: {
          ownerActions: !readonly,
          alert: alert(),
          history: [
            {
              action: state,
              version,
              occurred_at: new Date().toISOString(),
              actor_account: null,
            },
          ],
          evidence: [
            {
              source: "agent",
              source_id: "source-reference",
              event_type: "PREFLIGHT_REJECTED",
              reason: "PER_PAYMENT_LIMIT",
              occurred_at: new Date().toISOString(),
            },
          ],
          nextOffset: null,
        },
      });
    }
    return route.fulfill({ status: 403, json: { error: "ACCESS_DENIED" } });
  });
  await page.goto("/workspace/security");
  await page
    .getByRole("combobox", { name: "Select organization" })
    .selectOption(org);
}
for (const width of [390, 1280])
  test(`incident review and safe emergency navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fixture(page);
    await expect(
      page.getByText("Outcome unknown — do not retry: 1"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Inspect incident" }).click();
    await expect(
      page.getByRole("heading", { name: "Incident review" }),
    ).toBeFocused();
    await expect(
      page.getByRole("link", { name: "Review wallet-authorized pause" }),
    ).toHaveAttribute(
      "href",
      `/workspace/settlement?mandate=${mandate}&action=PAUSE`,
    );
    await expect(
      page.getByText("No email, push message or owner contact is claimed.", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Acknowledge and assign to me" })
      .click();
    await expect(
      page.getByText("Incident updated. Financial state was not changed."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Begin investigation" }).click();
    await page.getByRole("button", { name: "Resolve incident only" }).click();
    await expect(
      page.getByText("Outcome unknown — do not retry: 1"),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("read-only responders have no mutation or owner-revoke controls", async ({
  page,
}) => {
  await fixture(page, { readonly: true });
  await page.getByRole("button", { name: "Inspect incident" }).click();
  await expect(
    page.getByText("You have read-only incident access."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Acknowledge and assign to me" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Review owner-only terminal revocation" }),
  ).toHaveCount(0);
});
test("changing organization clears prior incident and rejects unauthorized access", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Inspect incident" }).click();
  await page
    .getByRole("combobox", { name: "Select organization" })
    .selectOption(other);
  await expect(
    page.getByRole("heading", { name: "Incident review" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("You are not authorized for this action."),
  ).toBeVisible();
});
test("offline state offers retry without showing current verification", async ({
  page,
}) => {
  await fixture(page, { offline: true });
  await expect(
    page.getByRole("button", { name: "Refresh security" }),
  ).toBeEnabled();
  await expect(page.locator("main [role=alert]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
});
test("empty incidents do not claim guaranteed detection", async ({ page }) => {
  await fixture(page, { empty: true });
  await expect(
    page.getByText("No active alerts in this organization."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No incidents on this page. Monitoring is advisory and cannot guarantee detection.",
    ),
  ).toBeVisible();
});
test("canceling application containment does not call a mutation", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Inspect incident" }).click();
  let mutations = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") mutations++;
  });
  await page.getByRole("button", { name: "Review disabling agent" }).click();
  await expect(
    page.getByText("Remove this application access?", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(mutations).toBe(0);
});
