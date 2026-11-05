import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { inspectSdk } from "../../scripts/deployment-review/sdk-inspection.js";
import { createReviewer } from "../../scripts/deployment-review/server.js";

let server: ReturnType<typeof createReviewer>;
let base: string;
test.beforeAll(async () => {
  server = createReviewer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((e) => (e ? reject(e) : resolve()));
    server.closeAllConnections();
  });
});
for (const width of [1280, 390])
  test(`preview at ${width}px is readable, isolated and has no wallet invocation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const outgoing: string[] = [];
    page.on("request", (r) => outgoing.push(r.url()));
    await page.goto(base);
    await expect(
      page.getByRole("heading", {
        name: "Preview only — wallet invocation unavailable",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Offline historical preview — not current chain readiness",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(
      page.getByText('FunctionCall new({"network":"testnet"})', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Refresh read-only inspection" })
      .click();
    expect(outgoing.every((url) => url.startsWith(base))).toBe(true);
    expect(page.context().pages()).toHaveLength(1);
    expect(await page.context().cookies()).toEqual([]);
  });
test("browser structured-clone transport carries full SDK payload unchanged (not a Meteor wallet test)", async ({
  page,
}) => {
  const { payload } = await inspectSdk();
  // about:blank local MessageChannel. No SDK wallet initialization, popup or network.
  const result = await page.evaluate(
    async (data) =>
      new Promise<string>((resolve) => {
        const channel = new MessageChannel();
        channel.port2.onmessage = (event) => {
          resolve(event.data.inputs.transactions);
          channel.port1.close();
          channel.port2.close();
        };
        channel.port1.postMessage({ inputs: { transactions: data } });
      }),
    payload,
  );
  expect(result).toBe(payload);
});
