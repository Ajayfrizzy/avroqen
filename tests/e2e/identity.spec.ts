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

// Real installed SDK dialog cancellation; no wallet proof or authenticated API is simulated.
test("Meteor cancellation stays signed out and retry requests a fresh challenge", async ({
  page,
}) => {
  let challenges = 0;
  let verifications = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/config"))
      return route.fulfill({
        json: { network: "testnet", origin: "http://127.0.0.1:3000" },
      });
    if (path.endsWith("/session"))
      return route.fulfill({
        status: 401,
        json: { error: "SESSION_REQUIRED" },
      });
    if (path.endsWith("/challenge"))
      return route.fulfill({
        json: {
          challengeId: `fixture-${++challenges}`,
          message: "Test-only login challenge",
          nonce: Buffer.alloc(32, challenges).toString("base64"),
          recipient: "http://127.0.0.1:3000",
        },
      });
    if (path.endsWith("/verify")) verifications++;
    return route.fulfill({ status: 500 });
  });
  await page.goto("/workspace");
  await page.getByLabel("NEAR account").fill("alice.testnet");
  const button = page.getByRole("button", {
    name: "Connect wallet & sign message",
  });
  for (let attempt = 1; attempt <= 2; attempt++) {
    await button.click();
    // Invoke the SDK component's actual close handler (the same handler as its close UI).
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("*")).some(
        (node) =>
          node.tagName.startsWith("METEOR-") &&
          typeof (node as HTMLElement & { closeAction?: unknown })
            .closeAction === "function",
      ),
    );
    await expect(
      page
        .getByRole("main")
        .getByText("Wallet sign-in canceled. No transaction was sent."),
    ).toHaveCount(0);
    await page.evaluate(() => {
      const node = Array.from(document.querySelectorAll("*")).find(
        (node) =>
          node.tagName.startsWith("METEOR-") &&
          typeof (node as HTMLElement & { closeAction?: unknown })
            .closeAction === "function",
      );
      (node as HTMLElement & { closeAction: () => void }).closeAction();
    });
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "Wallet sign-in canceled. No transaction was sent.",
    );
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(button).toBeEnabled();
    expect(challenges).toBe(attempt);
    expect(verifications).toBe(0);
    await expect(
      page.getByRole("heading", { name: /Signed in as/ }),
    ).toHaveCount(0);
  }
});

// Explicit API simulation: delayed org A data must not replace the selected org B.
test("organization selection ignores stale agent responses and clears previous controls", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: () => void = () => {};
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/config"))
      return route.fulfill({
        json: { network: "testnet", origin: "http://127.0.0.1:3000" },
      });
    if (path.endsWith("/session"))
      return route.fulfill({
        json: {
          accountId: "alice.testnet",
          network: "testnet",
          csrfToken: "ui-fixture",
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        },
      });
    if (path.endsWith("/organizations"))
      return route.fulfill({
        json: {
          organizations: [
            { id: "org-a", name: "First", role: "owner" },
            { id: "org-b", name: "Second", role: "viewer" },
          ],
          nextOffset: null,
        },
      });
    if (path.includes("/org-a/")) {
      started();
      await gate;
      return route.fulfill({
        json: {
          agents: [
            {
              id: "agent-a",
              name: "Stale agent",
              accountId: "agent.testnet",
              disabledAt: null,
            },
          ],
          nextOffset: null,
        },
      });
    }
    return route.fulfill({ json: { agents: [], nextOffset: null } });
  });
  await page.goto("/workspace");
  const select = page.getByLabel("Select organization");
  await select.selectOption("org-a");
  await requested;
  await expect(page.getByText("Loading agents…")).toBeVisible();
  await select.selectOption("org-b");
  await expect(
    page.getByRole("heading", { name: "Agents in Second" }),
  ).toBeVisible();
  await expect(page.getByText("No agents registered.")).toBeVisible();
  const staleResponse = page.waitForResponse((response) =>
    response.url().includes("/org-a/agents"),
  );
  release();
  await (await staleResponse).finished();
  await expect(page.getByText("Stale agent", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Register agent record" }),
  ).toHaveCount(0);
  await select.selectOption("");
  await expect(
    page.getByRole("heading", { name: "Agents in Second" }),
  ).toHaveCount(0);
});

for (const [code, expected] of [
  ["AGENT_ALREADY_REGISTERED", "already registered"],
  ["AGENT_PREVIOUSLY_DISABLED", "previously disabled"],
  ["INVALID_REQUEST", "Check the account format"],
  ["PRIVATE_DATABASE_ERROR", "Refresh the list before retrying"],
  ["NETWORK", "Network connection failed"],
] as const) {
  test(`agent registration gives safe actionable feedback: ${code}`, async ({
    page,
  }) => {
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/config"))
        return route.fulfill({
          json: { network: "testnet", origin: "http://127.0.0.1:3000" },
        });
      if (path.endsWith("/session"))
        return route.fulfill({
          json: {
            accountId: "alice.testnet",
            network: "testnet",
            csrfToken: "fixture",
            expiresAt: new Date(Date.now() + 900000).toISOString(),
          },
        });
      if (path.endsWith("/organizations"))
        return route.fulfill({
          json: {
            organizations: [{ id: "org", name: "Org", role: "owner" }],
            nextOffset: null,
          },
        });
      if (route.request().method() === "POST") {
        if (code === "NETWORK") return route.abort("internetdisconnected");
        return route.fulfill({
          status:
            code === "INVALID_REQUEST"
              ? 400
              : code === "PRIVATE_DATABASE_ERROR"
                ? 503
                : 409,
          json: { error: code, detail: "secret database details" },
        });
      }
      return route.fulfill({ json: { agents: [], nextOffset: null } });
    });
    await page.goto("/workspace");
    await page.getByLabel("Select organization").selectOption("org");
    await page.getByLabel("Agent name").fill("Agent");
    await page.getByLabel("Agent NEAR account").fill("agent.testnet");
    await page.getByRole("button", { name: "Register agent record" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      expected,
    );
    await expect(page.getByRole("main")).not.toContainText(
      "secret database details",
    );
    await expect(
      page.getByRole("button", { name: "Register agent record" }),
    ).toBeEnabled();
  });
}
