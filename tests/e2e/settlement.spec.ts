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
    await expect(
      page.getByText("Live submission disabled.", { exact: false }),
    ).toHaveCount(0);
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
            wallet_outcome: "WALLET_CANCELED",
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
    page.getByText(
      "Avroqen will compare the exact operation with finalized onchain transactions.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Wallet report: canceled without a transaction hash."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View verified transaction" }),
  ).toHaveCount(0);
});
test("controlled replacement cancellation leaves UNKNOWN and never opens a transaction action", async ({
  page,
}) => {
  let challenges = 0;
  let completions = 0;
  let transactionRequests = 0;
  const original = {
    id: "fc90a45b-5a0d-42bb-a73b-e4c1bec9ef84",
    state: "UNKNOWN",
    reason: "HASH_NOT_RECOVERED",
    wallet_outcome: "WALLET_OUTCOME_UNKNOWN",
    replacement_authorized_at: null,
    operation: {
      network: "testnet",
      signerId: policy.ownerAccount,
      receiverId: policy.vaultAccount,
      methodName: "storage_deposit",
      args: {},
      gas: "100000000000000",
      deposit: "100000000000000000000000",
      mandateId: policy.mandateId,
      policyDigest: "a".repeat(64),
      kind: "STORAGE_DEPOSIT",
    },
    explorerUrl: null,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
    if (path.endsWith("/recovery/challenge")) {
      challenges++;
      return route.fulfill({
        json: {
          challengeId: `recovery-${challenges}`,
          replacementIntentId: "33333333-3333-4333-8333-333333333333",
          message: "Authorize one unsigned controlled replacement only",
          nonce: Buffer.alloc(32, challenges).toString("base64"),
          recipient: "http://127.0.0.1:3000",
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        },
      });
    }
    if (path.endsWith("/recovery/complete")) {
      completions++;
      return route.fulfill({ status: 500 });
    }
    if (path.endsWith("/begin") || path.endsWith("/report")) {
      transactionRequests++;
      return route.fulfill({ status: 500 });
    }
    return route.fulfill({
      json: {
        policy,
        onchain: null,
        block: null,
        proposals: [],
        reviews: [],
        intents: [original],
      },
    });
  });
  await page.goto(`/workspace/settlement?mandate=${policy.mandateId}`);
  await page
    .getByRole("button", { name: "Review controlled replacement" })
    .click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("*")).some(
      (node) =>
        node.tagName.startsWith("METEOR-") &&
        typeof (node as HTMLElement & { closeAction?: unknown }).closeAction ===
          "function",
    ),
  );
  await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll("*")).find(
      (candidate) =>
        candidate.tagName.startsWith("METEOR-") &&
        typeof (candidate as HTMLElement & { closeAction?: unknown })
          .closeAction === "function",
    );
    (node as HTMLElement & { closeAction: () => void }).closeAction();
  });
  await expect(
    page.getByText("Wallet sign-in canceled. No transaction was sent."),
  ).toBeVisible();
  await expect(page.getByText("unknown", { exact: true })).toBeVisible();
  expect(challenges).toBe(1);
  expect(completions).toBe(0);
  expect(transactionRequests).toBe(0);
});
test("expired and unsafe historical mandates stay readable but cannot authorize", async ({
  page,
}) => {
  const expired = {
      ...policy,
      mandateId: "66666666-6666-4666-8666-666666666666",
      taskReference: "Expired mandate",
      expiresAtNs: (BigInt(Date.now() - 60_000) * 1000000n).toString(),
    },
    unsafe = {
      ...policy,
      mandateId: "77777777-7777-4777-8777-777777777777",
      taskReference: "Unsafe historical mandate",
      verifierPolicy: {
        ...policy.verifierPolicy,
        accounts: [policy.ownerAccount],
      },
    },
    both = {
      ...unsafe,
      mandateId: "88888888-8888-4888-8888-888888888888",
      taskReference: "Expired unsafe mandate",
      expiresAtNs: expired.expiresAtNs,
    },
    policies = [policy, expired, unsafe, both];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session"))
      return route.fulfill({
        json: { accountId: policy.ownerAccount, csrfToken: "fixture" },
      });
    if (path.endsWith("/assignments"))
      return route.fulfill({ json: { mandates: policies } });
    if (path.endsWith("/status"))
      return route.fulfill({
        json: { status: "VERIFIED", submissionEnabled: true },
      });
    const selected = policies.find((candidate) =>
      path.includes(candidate.mandateId),
    );
    if (!selected)
      return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
    return route.fulfill({
      json: {
        policy: selected,
        onchain: null,
        block: null,
        proposals: [
          {
            proposalId: "99999999-9999-4999-8999-999999999999",
            amountAtomic: "1",
            recipient: selected.recipient,
          },
        ],
        reviews: [],
        intents: [
          {
            id: `history-${selected.mandateId}`,
            state: "UNKNOWN",
            reason: "HISTORICAL_RECORD",
            operation: {
              methodName: "submit_proposal",
              signerId: selected.agentAccount,
            },
            explorerUrl: null,
          },
        ],
      },
    });
  });
  await page.goto("/workspace/settlement");
  const selector = page.getByRole("combobox", {
    name: "Mandate",
    exact: true,
  });
  const warning = page.getByRole("alert", { name: "Mandate safety status" });
  const prepare = page.getByRole("button", {
    name: "Prepare exact operation",
  });

  await selector.selectOption(policy.mandateId);
  await expect(warning).toHaveCount(0);
  await expect(prepare).toBeEnabled();

  await selector.selectOption(expired.mandateId);
  await expect(warning).toContainText("This mandate expired at");
  await expect(warning).not.toContainText("Unsafe historical verifier policy");
  await expect(prepare).toBeDisabled();

  await selector.selectOption(unsafe.mandateId);
  await expect(warning).toContainText("Unsafe historical verifier policy");
  await expect(warning).not.toContainText("This mandate expired at");
  await expect(
    page.getByText("submit_proposal", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Do not repeat this operation", { exact: false }),
  ).toBeVisible();
  await expect(prepare).toBeDisabled();

  await selector.selectOption(both.mandateId);
  await expect(warning).toContainText("This mandate expired at");
  await expect(warning).toContainText("Unsafe historical verifier policy");
  await expect(prepare).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Open wallet and authorize" }),
  ).toHaveCount(0);
});
test("selected policy safety remains visible when chain state is unavailable", async ({
  page,
}) => {
  const historical = {
      ...policy,
      mandateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskReference: "Unavailable historical mandate",
      expiresAtNs: (BigInt(Date.now() - 60_000) * 1000000n).toString(),
      verifierPolicy: {
        ...policy.verifierPolicy,
        accounts: [policy.recipient],
      },
    },
    methods: string[] = [];
  await page.route("**/api/**", async (route) => {
    methods.push(route.request().method());
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session"))
      return route.fulfill({
        json: { accountId: policy.ownerAccount, csrfToken: "fixture" },
      });
    if (path.endsWith("/assignments"))
      return route.fulfill({ json: { mandates: [historical] } });
    if (path.endsWith("/status"))
      return route.fulfill({ status: 503, json: { error: "UNAVAILABLE" } });
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
  });
  await page.goto("/workspace/settlement");
  await page
    .getByRole("combobox", { name: "Mandate", exact: true })
    .selectOption(historical.mandateId);

  const warning = page.getByRole("alert", { name: "Mandate safety status" });
  await expect(warning).toContainText("This mandate expired at");
  await expect(warning).toContainText("Unsafe historical verifier policy");
  await expect(warning).toContainText("recipient role");
  await page.getByText("Exact policy and atomic units").click();
  await expect(page.locator("pre")).toContainText(historical.mandateId);
  await expect(
    page.getByRole("button", { name: "Prepare exact operation" }),
  ).toHaveCount(0);
  expect(methods.every((method) => method === "GET")).toBe(true);
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

for (const failure of ["status", "detail"])
  test(`failed ${failure} refresh hides stale balances and blocks wallet actions`, async ({
    page,
  }) => {
    let failed = false;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/session"))
        return route.fulfill({
          json: { accountId: policy.ownerAccount, csrfToken: "fixture" },
        });
      if (path.endsWith("/assignments"))
        return route.fulfill({ json: { mandates: [policy] } });
      if (
        failed &&
        ((failure === "status" && path.endsWith("/status")) ||
          (failure === "detail" && path.endsWith("/chain")))
      )
        return route.abort();
      if (path.endsWith("/status"))
        return route.fulfill({
          json: { status: "VERIFIED", submissionEnabled: true },
        });
      return route.fulfill({
        json: {
          policy,
          onchain: {
            status: "Active",
            available: "1000000000000000000000000",
            reserved: "0",
            spent: "0",
            withdrawal_pending: "0",
          },
          block: { height: 123 },
          intents: [],
          proposals: [],
          reviews: [],
        },
      });
    });
    await page.goto(`/workspace/settlement?mandate=${policy.mandateId}`);
    await expect(
      page.getByText("Available: 1 NEAR", { exact: false }),
    ).toBeVisible();
    failed = true;
    await page.getByRole("button", { name: "Refresh verified state" }).click();
    await expect(
      page.getByText("Available: 1 NEAR", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Prepare exact operation" }),
    ).toBeDisabled();
    failed = false;
    await page.getByRole("button", { name: "Refresh verified state" }).click();
    await expect(
      page.getByText("Available: 1 NEAR", { exact: false }),
    ).toBeVisible();
  });

test("optional guardian is bound in exact registration and tampered response cannot open wallet", async ({
  page,
}) => {
  let operation: Record<string, unknown> | undefined;
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
    if (path.endsWith("/intents")) {
      operation = route.request().postDataJSON().operation;
      return route.fulfill({
        json: { id: "fixture", operation: { guardian: "attacker.testnet" } },
      });
    }
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
  await page.goto(`/workspace/settlement?mandate=${policy.mandateId}`);
  await page.getByLabel("Storage spending ceiling (NEAR)").fill("0.15");
  await page.getByLabel("Optional guardian account").fill("guardian.testnet");
  await page.getByRole("button", { name: "Prepare exact operation" }).click();
  await expect
    .poll(() => operation)
    .toEqual({
      kind: "REGISTER",
      storageLimit: "150000000000000000000000",
      guardian: "guardian.testnet",
    });
  await expect(
    page.getByText("Prepared transaction does not match", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open wallet and authorize" }),
  ).toHaveCount(0);
});
