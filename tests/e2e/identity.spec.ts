import { expect, test } from "@playwright/test";

test("mobile signed-out workspace is explicit about message-only authority", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: { network: "testnet", origin: "http://127.0.0.1:3000" },
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 401, json: { error: "SESSION_REQUIRED" } }),
  );
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Connect wallet & sign message" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Never enter a private key here.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Signing a login message sends no transaction.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("service errors are visible without leaking backend messages", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ status: 503, json: { error: "internal secret" } }),
  );
  await page.goto("/workspace");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "could not be completed",
  );
  await expect(
    page.getByRole("button", { name: "Connect wallet & sign message" }),
  ).toBeDisabled();
  await expect(page.locator("body")).not.toContainText("internal secret");
});

// Explicit UI boundary simulation; real API, crypto and PostgreSQL tests live in tests/database.
test("mobile owner creates an organization, registers and disables an agent, then logs out", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const org = { id: "organization-fixture", name: "Research", role: "owner" };
  const agents: {
    id: string;
    name: string;
    accountId: string;
    disabledAt: string | null;
  }[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === "/api/auth/config")
      return route.fulfill({
        json: { network: "testnet", origin: "http://127.0.0.1:3000" },
      });
    if (path === "/api/auth/session")
      return route.fulfill({
        json: {
          accountId: "alice.testnet",
          network: "testnet",
          csrfToken: "test-ui-csrf",
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        },
      });
    if (req.method() === "POST")
      expect(req.headers()["x-csrf-token"]).toBe("test-ui-csrf");
    if (path === "/api/organizations")
      return route.fulfill({
        json:
          req.method() === "POST"
            ? org
            : { organizations: [], nextOffset: null },
      });
    if (path.endsWith("/disable")) {
      if (agents[0]) agents[0].disabledAt = new Date().toISOString();
      return route.fulfill({ json: agents[0] });
    }
    if (path.endsWith("/agents")) {
      if (req.method() === "POST") {
        expect(req.postDataJSON()).toEqual({
          name: "Researcher",
          accountId: "agent.testnet",
        });
        agents.push({
          id: "agent-fixture",
          ...req.postDataJSON(),
          disabledAt: null,
        });
        return route.fulfill({ status: 201, json: agents[0] });
      }
      return route.fulfill({ json: { agents, nextOffset: null } });
    }
    if (path === "/api/auth/logout")
      return route.fulfill({ json: { loggedOut: true } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/workspace");
  await expect(
    page.getByText("No organizations yet. Create one to begin."),
  ).toBeVisible();
  await page.getByLabel("New organization name").fill("Research");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText("No agents registered.")).toBeVisible();
  await page.getByLabel("Agent name", { exact: true }).fill("Researcher");
  await page.getByLabel("Agent NEAR account").fill("agent.testnet");
  await page.getByRole("button", { name: "Register agent record" }).click();
  await expect(
    page.getByText("Registered — no execution authority"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(page.getByText("Disabled", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("button", { name: "Connect wallet & sign message" }),
  ).toBeVisible();
});

test("viewer has read-only controls and server authorization denial is shown", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/config"))
      return route.fulfill({ json: { network: "testnet" } });
    if (path.endsWith("/session"))
      return route.fulfill({
        json: {
          accountId: "viewer.testnet",
          network: "testnet",
          csrfToken: "fixture",
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        },
      });
    if (path.endsWith("/organizations"))
      return route.fulfill({
        json: {
          organizations: [
            { id: "view-org", name: "Read only", role: "viewer" },
          ],
          nextOffset: null,
        },
      });
    return route.fulfill({ status: 403, json: { error: "ACCESS_DENIED" } });
  });
  await page.goto("/workspace");
  await page.getByLabel("Select organization").selectOption("view-org");
  await expect(
    page.getByText("Read-only access.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Register agent record" }),
  ).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "not authorized",
  );
});

test("session loading and expiry states are visible", async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/config", async (route) => {
    await gate;
    return route.fulfill({ json: { network: "testnet" } });
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        accountId: "alice.testnet",
        csrfToken: "fixture",
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      },
    }),
  );
  await page.route("**/api/organizations?*", (route) =>
    route.fulfill({ json: { organizations: [], nextOffset: null } }),
  );
  await page.goto("/workspace");
  await expect(page.getByRole("status")).toContainText("Loading your session");
  release?.();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Your session ended",
  );
});
