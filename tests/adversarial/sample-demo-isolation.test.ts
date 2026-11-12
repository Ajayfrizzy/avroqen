import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { sampleRoute } from "../../apps/web/app/demo/sample-data";
import { assertSampleIsolation } from "../support/sample-isolation";

const root = "apps/web/app/demo";
function sources(directory = root): [string, string][] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("SAMPLE_SYMLINK");
    if (entry.isDirectory()) return sources(path);
    if (!/\.(ts|tsx)$/.test(path)) throw new Error("SAMPLE_UNREVIEWED_ASSET");
    return [[path, readFileSync(path, "utf8")]];
  });
}
it("keeps all demo source dependencies inside the reviewed presentation boundary", () => {
  expect(() => assertSampleIsolation(new Map(sources()))).not.toThrow();
});
it.each([
  "@meteorwallet/sdk",
  "@avroqen/domain",
  "next/headers",
  "node:crypto",
  "../components/shell",
  "../workspace/wallet",
  "../workspace/journey/status",
  "../../../../api/src/identity/routes",
  "../../../../../services/chain/rpc",
  "../../../../../scripts/primary-key-verification/verify",
])("rejects prohibited imports, including type-only imports: %s", (module) => {
  for (const prefix of ["import", "import type"])
    expect(() =>
      assertSampleIsolation(
        new Map([[`${root}/bad.ts`, `${prefix} { x } from '${module}';`]]),
      ),
    ).toThrow();
});
it.each([
  "fetch('/api/auth/session')",
  "const send = fetch; send('/api/chain/begin')",
  "globalThis['fetch']('/api/auth/verify')",
  "new WebSocket('wss://invalid.example')",
  "new XMLHttpRequest()",
  "navigator.sendBeacon('/api/chain/begin', 'x')",
  "document.cookie",
  "localStorage.setItem('org', 'real')",
  "sessionStorage.clear()",
  "indexedDB.open('real')",
  "process.env.M6_TRANSACTIONS_ENABLED",
  "import('@meteorwallet/sdk')",
  "require('../workspace/wallet')",
  "eval('fetch()')",
  "new Function('return window')",
  "({}).constructor",
  "export async function x() { 'use server'; }",
  "export default () => <form action='/api/chain/begin' />",
  "export default () => <iframe src='/workspace' />",
  "export default () => <script src='https://invalid.example' />",
  "setTimeout('fetch(\"/api/chain/begin\")', 0)",
  "export default () => <a href='/api/auth/session'>View</a>",
  "export default () => <a href='https://invalid.example'>View</a>",
  "export default () => <a href={untrusted}>View</a>",
  "export default () => <meta httpEquiv='refresh' content='0;url=/workspace' />",
])("rejects inert source fixture %s without executing it", (source) => {
  expect(() =>
    assertSampleIsolation(new Map([[`${root}/bad.tsx`, source]])),
  ).toThrow();
});
it("follows local dependency files instead of checking only the page import", () => {
  expect(() =>
    assertSampleIsolation(
      new Map([
        [`${root}/page.tsx`, "import { value } from './hidden';"],
        [
          `${root}/hidden.ts`,
          "export const value = fetch('/api/auth/session');",
        ],
      ]),
    ),
  ).toThrow();
  expect(() =>
    assertSampleIsolation(
      new Map([[`${root}/page.tsx`, "import { x } from './missing';"]]),
    ),
  ).toThrow();
});
it("admits only the reviewed pure formatter export, never domain authority helpers", () => {
  for (const symbol of ["readApiConfig", "mandatePolicy", "consentMessage"]) {
    expect(() =>
      assertSampleIsolation(
        new Map([
          [
            `${root}/bad.ts`,
            `import { ${symbol} } from '../../../../packages/domain/src/index';`,
          ],
        ]),
      ),
    ).toThrow("SAMPLE_IMPORT");
  }
  expect(() =>
    assertSampleIsolation(
      new Map([
        [
          `${root}/format.ts`,
          "import { atomicToNear } from '../../../../packages/domain/src/index';",
        ],
      ]),
    ),
  ).not.toThrow();
});
it("permits only reviewed presentational UI exports and literal local imports", () => {
  expect(() =>
    assertSampleIsolation(
      new Map([
        [
          `${root}/page.tsx`,
          "import { Card, Badge as Tag } from '../components/ui';",
        ],
      ]),
    ),
  ).not.toThrow();
  expect(() =>
    assertSampleIsolation(
      new Map([
        [
          `${root}/page.tsx`,
          "export default () => <a href='/demo/mandate'>View</a>",
        ],
      ]),
    ),
  ).not.toThrow();
  expect(() =>
    assertSampleIsolation(
      new Map([
        [`${root}/page.tsx`, "import { GuidedForm } from '../components/ui';"],
      ]),
    ),
  ).toThrow();
  expect(() =>
    assertSampleIsolation(
      new Map([[`${root}/route.ts`, "export const GET = () => null;"]]),
    ),
  ).toThrow();
});
it("requires renewed review if shared UI, global layout or routing changes", () => {
  const reviewed = {
    "apps/web/app/components/ui.tsx":
      "76619c7ea87d18ba5c754b66a96e98fc319e8e6275e5472483431a880972735d",
    "apps/web/app/layout.tsx":
      "dd0a4f0e90b678a949d1b1a24cfaec35479298f09a917ca0cd5f2ecc6cc69ba1",
    "apps/web/next.config.ts":
      "941e0b02ea9df33e020cc8d0e5431de13970e3ab4b591fc22b224e44eccc20b9",
    "packages/domain/src/index.ts":
      "20c6c51101e18dfdbfc3245f7eb36e6d8c7fc59d5ab170ee05212d13b4e9d7c1",
    "packages/domain/src/vault.ts":
      "2e91b67ff9b51f80ad052aafb0a373b4d99d754d3b36bddccd1c7b1fb09b8942",
  };
  for (const [file, digest] of Object.entries(reviewed))
    expect(
      createHash("sha256").update(readFileSync(file)).digest("hex"),
      file,
    ).toBe(digest);
  for (const directory of ["apps/web", "apps/web/src", "apps/web/app"])
    for (const name of ["middleware", "proxy"])
      for (const extension of ["ts", "tsx", "js", "mjs", "cjs"])
        expect(existsSync(`${directory}/${name}.${extension}`)).toBe(false);
  const css = readFileSync("apps/web/app/styles.css", "utf8");
  expect(css).not.toMatch(/@import/i);
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)/gi)].map((m) => m[1]);
  expect(urls.every((url) => url?.startsWith("data:image/svg+xml,"))).toBe(
    true,
  );
});
it.each([
  "/demo?organization=real",
  "/demo#live",
  "/demo/mandate?network=mainnet",
  "/demo/../workspace",
  "/demo/%2e%2e/workspace",
  "//demo",
  "https://invalid.example/demo",
  "/demo/",
  "/demo/live",
  "DEMO",
  null,
  {},
])("rejects unknown paths and runtime data selectors %j", (path) => {
  expect(sampleRoute(path)).toBeNull();
});
