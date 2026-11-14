import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { arch, platform, release, tmpdir, type, version } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT = resolve(ROOT, "docs/evidence/m9");
const BUILD_OUTPUT = resolve(ROOT, "apps/web/.next");
const BASE_ORIGIN = "http://127.0.0.1:3000";
const EXPECTED_SOURCE_SHA = "ad0be88c8c8faddd6c8840fc8b3822bc99951af4";
const EXPECTED_SAMPLE_BLOB = "31b5475496e942847e41725cc663f4a319fce105";
const MANIFEST = "README.md";

const captures = Object.freeze([
  ["/demo", "sample-start-1440.png", 1440, 900, "desktop"],
  ["/demo/mandate", "sample-mandate-1440.png", 1440, 900, "desktop"],
  ["/demo/proposal", "sample-proposal-1440.png", 1440, 900, "desktop"],
  ["/demo/review", "sample-review-1440.png", 1440, 900, "desktop"],
  ["/demo/outcomes", "sample-outcomes-1440.png", 1440, 900, "desktop"],
  ["/demo/evidence", "sample-evidence-1440.png", 1440, 900, "desktop"],
  ["/demo", "sample-start-390.png", 390, 844, "mobile-emulation"],
  ["/demo/outcomes", "sample-outcomes-390.png", 390, 844, "mobile-emulation"],
  ["/demo/evidence", "sample-evidence-390.png", 390, 844, "mobile-emulation"],
]);
const sampleRoutes = new Set(captures.map(([routePath]) => routePath));
const expectedPngs = captures.map(([, filename]) => filename).sort();
const publicationNames = [MANIFEST, ...expectedPngs];
let activeEvidenceTempPath;
const permittedWorkingTreePaths = new Set([
  "scripts/capture-m9-screenshots.mjs",
  "docs/evidence/m9/README.md",
  ...expectedPngs.map((name) => `docs/evidence/m9/${name}`),
]);

function command(commandName, args) {
  return execFileSync(commandName, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSourceProvenance() {
  const sourceSha = command("git", ["rev-parse", "HEAD"]);
  if (sourceSha !== EXPECTED_SOURCE_SHA)
    throw new Error(`UNEXPECTED_SOURCE_SHA:${sourceSha}`);
  const sampleBlob = command("git", [
    "hash-object",
    "apps/web/app/demo/sample-data.ts",
  ]);
  const headSampleBlob = command("git", [
    "rev-parse",
    "HEAD:apps/web/app/demo/sample-data.ts",
  ]);
  if (
    sampleBlob !== EXPECTED_SAMPLE_BLOB ||
    headSampleBlob !== EXPECTED_SAMPLE_BLOB
  )
    throw new Error("SAMPLE_DATASET_DIFFERS_FROM_APPROVED_SOURCE");

  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  );
  for (const entry of status.split("\0").filter(Boolean)) {
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (code.includes("R") || code.includes("C"))
      throw new Error(`RENAMED_OR_COPIED_WORKTREE_PATH:${path}`);
    if (code[0] !== " " && code[0] !== "?")
      throw new Error(`STAGED_PATH_NOT_ALLOWED:${path}`);
    const isActiveEvidenceTemp =
      activeEvidenceTempPath &&
      (path === activeEvidenceTempPath ||
        path.startsWith(`${activeEvidenceTempPath}/`));
    if (!permittedWorkingTreePaths.has(path) && !isActiveEvidenceTemp)
      throw new Error(`RENDERING_INPUT_NOT_CLEAN:${path}`);
  }
  return { sourceSha, sampleBlob };
}

async function assertSafePublicationTargets() {
  await mkdir(OUTPUT, { recursive: true });
  const outputStat = await lstat(OUTPUT);
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink())
    throw new Error("UNSAFE_OUTPUT_DIRECTORY");
  const unexpectedPngs = (await readdir(OUTPUT))
    .filter((name) => name.endsWith(".png") && !expectedPngs.includes(name))
    .sort();
  if (unexpectedPngs.length)
    throw new Error(`UNEXPECTED_EXISTING_PNG:${unexpectedPngs.join(",")}`);
  for (const name of publicationNames) {
    try {
      const targetStat = await lstat(join(OUTPUT, name));
      if (targetStat.isSymbolicLink() || !targetStat.isFile())
        throw new Error(`UNSAFE_PUBLICATION_TARGET:${name}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function assertNoWebEnvironmentFiles() {
  for (const name of [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ]) {
    try {
      await lstat(resolve(ROOT, "apps/web", name));
      throw new Error(`UNREVIEWED_WEB_ENVIRONMENT_FILE:${name}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function minimalEnvironment(isBuild) {
  const environment = {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: process.env.AVROQEN_CAPTURE_HOME,
    TMPDIR: process.env.AVROQEN_CAPTURE_TMPDIR,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    TZ: "UTC",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    CI: "1",
  };
  if (!environment.HOME || !environment.TMPDIR)
    throw new Error("ISOLATED_ENVIRONMENT_NOT_INITIALIZED");
  if (isBuild) environment.NEXT_PHASE = "phase-production-build";
  return environment;
}

async function runProcess(executable, args, options) {
  const child = spawn(executable, args, {
    cwd: ROOT,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", resolveExit);
  });
  if (exitCode !== 0) {
    const diagnostic = output
      .join("")
      .slice(-4000)
      .replaceAll(ROOT, "<repository>")
      .replaceAll(options.env.HOME, "<isolated-home>")
      .replaceAll(options.env.TMPDIR, "<isolated-tmp>");
    throw new Error(`${options.label}_FAILED_${exitCode}:${diagnostic}`);
  }
}

async function buildFromVerifiedSource(buildEnvironment) {
  await rm(BUILD_OUTPUT, { recursive: true, force: true });
  await runProcess(
    "pnpm",
    ["--filter", "@avroqen/web", "exec", "next", "build"],
    { env: buildEnvironment, label: "PRODUCTION_BUILD" },
  );
  const buildId = (
    await readFile(join(BUILD_OUTPUT, "BUILD_ID"), "utf8")
  ).trim();
  if (!buildId) throw new Error("MISSING_BUILD_ID");
  assertSourceProvenance();
  return buildId;
}

async function waitForServer(server, serverOutput, runtimeEnvironment) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (server.exitCode !== null) {
      const diagnostic = serverOutput
        .join("")
        .slice(-4000)
        .replaceAll(ROOT, "<repository>")
        .replaceAll(runtimeEnvironment.HOME, "<isolated-home>")
        .replaceAll(runtimeEnvironment.TMPDIR, "<isolated-tmp>");
      throw new Error(`NEXT_SERVER_EXITED_${server.exitCode}:${diagnostic}`);
    }
    try {
      const response = await fetch(`${BASE_ORIGIN}/demo`, {
        method: "GET",
        redirect: "error",
      });
      if (response.status === 200) return;
    } catch {
      // The verified production server is not listening yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error("NEXT_SERVER_START_TIMEOUT");
}

function validatePng(bytes, expectedWidth, minimumHeight) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const trailer = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature))
    throw new Error("NOT_PNG");
  if (!bytes.subarray(-12).equals(trailer)) throw new Error("INCOMPLETE_PNG");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectedWidth || height < minimumHeight)
    throw new Error(`INVALID_PNG_DIMENSIONS:${width}x${height}`);
  return { width, height };
}

function classifyRequest(request) {
  const url = new URL(request.url());
  const method = request.method();
  if (url.origin !== BASE_ORIGIN) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  if (url.search !== "") return null;
  if (request.headers().authorization || request.headers().cookie) return null;
  if (request.resourceType() === "document" && sampleRoutes.has(url.pathname))
    return "sample-document";
  if (
    url.pathname.startsWith("/_next/static/") &&
    ["script", "stylesheet", "font", "image", "other"].includes(
      request.resourceType(),
    )
  )
    return "next-static";
  if (
    url.pathname === "/favicon.ico" &&
    ["other", "image"].includes(request.resourceType())
  )
    return "favicon";
  return null;
}

function assertRequestPolicyAdversarially() {
  const fake = (url, method, resourceType, headers = {}) => ({
    url: () => url,
    method: () => method,
    resourceType: () => resourceType,
    headers: () => headers,
  });
  const accepted = [
    fake(`${BASE_ORIGIN}/demo`, "GET", "document"),
    fake(`${BASE_ORIGIN}/demo/evidence`, "HEAD", "document"),
    fake(`${BASE_ORIGIN}/_next/static/chunks/example.js`, "GET", "script"),
    fake(`${BASE_ORIGIN}/favicon.ico`, "GET", "other"),
  ];
  const rejected = [
    fake(`${BASE_ORIGIN}/demo/unknown`, "GET", "document"),
    fake(`${BASE_ORIGIN}/demo?account=real.testnet`, "GET", "document"),
    fake(`${BASE_ORIGIN}/api/session`, "GET", "fetch"),
    fake(`${BASE_ORIGIN}/workspace`, "GET", "document"),
    fake(`${BASE_ORIGIN}/demo`, "POST", "document"),
    fake(`${BASE_ORIGIN}/demo`, "GET", "document", { cookie: "session=x" }),
    fake("https://rpc.testnet.near.org/", "POST", "fetch"),
  ];
  if (
    accepted.some((request) => !classifyRequest(request)) ||
    rejected.some((request) => classifyRequest(request))
  )
    throw new Error("REQUEST_POLICY_SELF_TEST_FAILED");
}

function operatingSystem() {
  if (platform() === "darwin") {
    try {
      const product = execFileSync("sw_vers", ["-productName"], {
        encoding: "utf8",
      }).trim();
      const productVersion = execFileSync("sw_vers", ["-productVersion"], {
        encoding: "utf8",
      }).trim();
      const buildVersion = execFileSync("sw_vers", ["-buildVersion"], {
        encoding: "utf8",
      }).trim();
      return `${product} ${productVersion} (${buildVersion}), ${arch()}`;
    } catch {
      // Fall through to Node's cross-platform metadata.
    }
  }
  return `${type()} ${release()} (${version()}), ${arch()}`;
}

function manifestText(metadata) {
  const rows = metadata.results
    .map(
      (result) =>
        `| \`${result.filename}\` | \`${result.route}\` | ${result.viewport.replace("x", " × ")} | ${result.image.replace("x", " × ")} | ${result.capturedAt} | \`${result.sha256}\` |`,
    )
    .join("\n");
  return `# M9 judge screenshot evidence manifest

**Status:** nine local SAMPLE screenshots recaptured on November 8, 2026. These
are genuine renders of fictional SAMPLE pages, not wallet, authenticated-session,
public-host, physical-device, source-evidence, financial-authorization or
blockchain-settlement evidence. Manual inspection of this recapture is pending;
capture does not authorize publication.

## Capture session

| Field | Recorded value |
| --- | --- |
| Evidence classification | \`SAMPLE\` — fictional judge walkthrough only |
| Base source Git SHA | \`${metadata.sourceSha}\` |
| Screenshot artifact commit | Not yet committed; source attribution is intentionally separate |
| Capture script SHA-256 | \`${metadata.captureScriptSha256}\`; uncommitted evidence tooling, excluded from rendering inputs |
| Immutable SAMPLE dataset blob | \`${metadata.sampleBlob}\` |
| Base origin | \`${metadata.baseOrigin}\` |
| Build mode | Fresh local production build created by the capture workflow after deleting the prior \`.next\`; all tracked and untracked rendering inputs matched the base source SHA |
| Build command | \`pnpm --filter @avroqen/web exec next build\` (performed by the capture script) |
| Build ID | \`${metadata.buildId}\` |
| Capture tool | Playwright Chromium via \`scripts/capture-m9-screenshots.mjs\` |
| Capture command | \`node scripts/capture-m9-screenshots.mjs\` |
| Playwright package | \`@playwright/test\` ${metadata.playwrightVersion} |
| Browser | Chromium ${metadata.browserVersion}, headless isolated contexts |
| Operating system | ${metadata.os} |
| Desktop viewport | 1440 × 900 CSS pixels |
| Mobile viewport | 390 × 844 CSS pixels; Chromium viewport emulation, not physical Android verification |
| Screenshot mode | Full page; output height expands to include the complete document |
| Device-pixel ratio | 1 |
| Zoom | 100% native CSS scale; no simulated or native browser zoom |
| JavaScript | Enabled |
| Color scheme | Light |
| Reduced motion | \`reduce\` |
| Locale | \`en-US\` |
| Stored browser state | None; fresh non-persistent context per image, isolated HOME/TMPDIR, no cookies or authorization headers |
| Observed browser requests | ${metadata.requestCounts["sample-document"]} exact SAMPLE documents, ${metadata.requestCounts["next-static"]} same-origin Next static assets, ${metadata.requestCounts.favicon} favicon requests; zero unclassified requests |

The workflow used a reviewed minimal environment for build, server and browser
processes. It did not pass arbitrary shell variables, \`.env\` values, tokens or
wallet configuration. The server bound only to \`127.0.0.1:3000\`. Document
requests were limited to the six exact approved SAMPLE paths using GET or HEAD;
only same-origin \`/_next/static/\` assets and \`/favicon.ico\` were additionally
allowed. Unknown SAMPLE paths, APIs, RPC, authenticated routes, external origins,
credential-bearing requests and unexpected methods were blocked and reported.

## Artifact inventory

All timestamps are UTC. SHA-256 values cover the exact PNG bytes in this directory.

| File | Route | Viewport CSS px | Image px | Captured | SHA-256 |
| --- | --- | --- | --- | --- | --- |
${rows}

## Automated capture validation

Before publication, the capture workflow verified:

- The pinned base SHA, immutable SAMPLE blob and clean rendering-input set.
- A fresh successful production build tied to that source.
- Exactly nine approved names/routes, complete PNG structure, expected widths,
  full-page heights and matching manifest hashes.
- HTTP 200, font readiness, two animation frames and network idle.
- DOM text presence for the fictional-data notice, “No network connected” and a
  SAMPLE label in every rendered card. Visual visibility requires the separate
  manual inspection below.
- One \`h1\`, one \`main\`, and no form, input, iframe or horizontal overflow.
- No misleading payment-success wording or rendered user-bound account, Ed25519
  key, credential, protected path or protected evidence.
- No popup, worker, WebSocket, unclassified request, wallet-provider access,
  cookie read/write, storage mutation, IndexedDB open, beacon or cookie.
- Safe non-symlink publication targets and rollback-protected set replacement.

Automated checks are not a manual visual review, accessibility audit,
physical-device test, wallet test or financial acceptance result.

## Manual visual inspection

Pending for this recapture. Do not describe these images as manually inspected
until all nine exact PNGs have been reviewed after publication.

Physical Android, manual screen-reader, native zoom, non-Chromium, hosted and
public-URL validation remain outstanding. Publication approval remains pending.

Deployment/initialization evidence is not payment evidence. These screenshots do
not establish a funded mandate, genuine independent source, verifier or owner
signing, public payment, recipient delta, Primary-key control, Testing-key
retirement or independent security audit. Primary proof remains **BLOCKED**, the
temporary Testing FullAccess key remains **RETAINED**, and financial operations
remain **DISABLED**.
`;
}

async function validateStagedSet(staging, metadata) {
  const names = (await readdir(staging)).sort();
  if (JSON.stringify(names) !== JSON.stringify(publicationNames.toSorted()))
    throw new Error(`STAGED_INVENTORY_MISMATCH:${JSON.stringify(names)}`);
  for (const result of metadata.results) {
    const bytes = await readFile(join(staging, result.filename));
    const capture = captures.find((entry) => entry[1] === result.filename);
    const dimensions = validatePng(bytes, capture[2], capture[3]);
    if (
      result.sha256 !== sha256(bytes) ||
      result.image !== `${dimensions.width}x${dimensions.height}`
    )
      throw new Error(`STAGED_ARTIFACT_MISMATCH:${result.filename}`);
  }
  const manifest = await readFile(join(staging, MANIFEST), "utf8");
  for (const result of metadata.results) {
    if (
      !manifest.includes(`\`${result.filename}\``) ||
      !manifest.includes(`\`${result.sha256}\``)
    )
      throw new Error(`MANIFEST_ENTRY_MISMATCH:${result.filename}`);
  }
}

async function publishSet(staging, metadata) {
  const backup = await mkdtemp(join(dirname(OUTPUT), ".m9-capture-backup-"));
  const backedUp = [];
  const published = [];
  try {
    for (const name of publicationNames) {
      try {
        await rename(join(OUTPUT, name), join(backup, name));
        backedUp.push(name);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    for (const name of publicationNames) {
      await rename(join(staging, name), join(OUTPUT, name));
      published.push(name);
    }
    const outputNames = (await readdir(OUTPUT))
      .filter((name) => name === MANIFEST || name.endsWith(".png"))
      .sort();
    if (
      JSON.stringify(outputNames) !==
      JSON.stringify(publicationNames.toSorted())
    )
      throw new Error("PUBLISHED_INVENTORY_MISMATCH");
    await validateStagedSet(OUTPUT, metadata);
  } catch (error) {
    for (const name of published) await rm(join(OUTPUT, name), { force: true });
    for (const name of backedUp)
      await rename(join(backup, name), join(OUTPUT, name));
    throw error;
  } finally {
    await rm(backup, { recursive: true, force: true });
  }
}

const provenance = assertSourceProvenance();
assertRequestPolicyAdversarially();
await assertNoWebEnvironmentFiles();
await assertSafePublicationTargets();

let existingServer = false;
try {
  existingServer = (await fetch(`${BASE_ORIGIN}/demo`)).ok;
} catch {
  // Expected when the required fresh production server is not running.
}
if (existingServer) throw new Error("PORT_3000_ALREADY_IN_USE");

const evidenceTemporary = await mkdtemp(
  join(dirname(OUTPUT), ".m9-capture-stage-"),
);
activeEvidenceTempPath = relative(ROOT, evidenceTemporary);
const runtimeTemporary = await mkdtemp(join(tmpdir(), "avroqen-m9-runtime-"));
const publication = join(evidenceTemporary, "publication");
const isolatedHome = join(runtimeTemporary, "home");
const isolatedTmp = join(runtimeTemporary, "tmp");
await mkdir(publication);
await mkdir(isolatedHome);
await mkdir(isolatedTmp);
process.env.AVROQEN_CAPTURE_HOME = isolatedHome;
process.env.AVROQEN_CAPTURE_TMPDIR = isolatedTmp;
const buildEnvironment = minimalEnvironment(true);
const runtimeEnvironment = minimalEnvironment(false);
let server;
let browser;
const serverOutput = [];

try {
  const buildId = await buildFromVerifiedSource(buildEnvironment);
  server = spawn(
    "pnpm",
    [
      "--filter",
      "@avroqen/web",
      "exec",
      "next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    {
      cwd: ROOT,
      env: runtimeEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => serverOutput.push(chunk.toString()));
  server.stderr.on("data", (chunk) => serverOutput.push(chunk.toString()));
  await waitForServer(server, serverOutput, runtimeEnvironment);

  browser = await chromium.launch({ headless: true, env: runtimeEnvironment });
  const browserVersion = browser.version();
  const results = [];
  const requestCounts = {
    "sample-document": 0,
    "next-static": 0,
    favicon: 0,
  };

  for (const [routePath, filename, width, height, profile] of captures) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
      locale: "en-US",
      javaScriptEnabled: true,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    const violations = [];
    await context.route("**/*", async (route) => {
      const request = route.request();
      const classification = classifyRequest(request);
      if (!classification) {
        violations.push(
          `request:${request.method()}:${request.resourceType()}:${request.url()}`,
        );
        await route.abort();
        return;
      }
      requestCounts[classification] += 1;
      await route.continue();
    });
    await context.addInitScript(() => {
      const attempts = [];
      Object.defineProperty(window, "sampleCaptureAttempts", {
        value: attempts,
      });
      const block = (name) => () => {
        attempts.push(name);
        throw new Error(`Prohibited SAMPLE capture capability: ${name}`);
      };
      for (const method of ["setItem", "removeItem", "clear"])
        Object.defineProperty(Storage.prototype, method, {
          value: block(`storage.${method}`),
        });
      const cookie = Object.getOwnPropertyDescriptor(
        Document.prototype,
        "cookie",
      );
      if (cookie)
        Object.defineProperty(Document.prototype, "cookie", {
          configurable: true,
          get: block("cookie.read"),
          set: block("cookie.write"),
        });
      for (const property of ["meteorCom", "meteorComV2", "near", "ethereum"])
        Object.defineProperty(window, property, {
          get: block(`wallet.${property}`),
        });
      navigator.sendBeacon = block("beacon");
      indexedDB.open = block("indexedDB");
    });

    const page = await context.newPage();
    page.on("popup", () => violations.push("popup"));
    page.on("worker", () => violations.push("worker"));
    page.on("websocket", () => violations.push("websocket"));
    page.on("pageerror", (error) =>
      violations.push(`pageerror:${error.message}`),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        violations.push(`console:${message.text()}`);
    });

    const response = await page.goto(`${BASE_ORIGIN}${routePath}`, {
      waitUntil: "networkidle",
    });
    if (response?.status() !== 200)
      throw new Error(`${filename}:HTTP_${response?.status() ?? "NONE"}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
      );
    });

    const checks = await page.evaluate(() => ({
      notice: document.body.textContent.includes(
        "SAMPLE — Fictional data. No wallet connection or transactions.",
      ),
      noNetwork: document.body.textContent.includes("No network connected"),
      cardCount: document.querySelectorAll(".sample-card").length,
      labeledCards: [...document.querySelectorAll(".sample-card")].filter(
        (card) =>
          [...card.querySelectorAll(".status-badge")].some(
            (badge) => badge.textContent?.trim() === "SAMPLE",
          ),
      ).length,
      h1Count: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main").length,
      forbiddenElements: document.querySelectorAll("form,input,iframe").length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      attempts: window.sampleCaptureAttempts,
      text: document.body.textContent,
    }));
    if (!checks.notice || !checks.noNetwork)
      throw new Error(`${filename}:MISSING_SAMPLE_DISCLOSURE`);
    if (checks.cardCount === 0 || checks.cardCount !== checks.labeledCards)
      throw new Error(`${filename}:UNLABELED_SAMPLE_CARD`);
    if (checks.h1Count !== 1 || checks.mainCount !== 1)
      throw new Error(`${filename}:INVALID_DOCUMENT_STRUCTURE`);
    if (checks.forbiddenElements !== 0 || checks.overflow)
      throw new Error(`${filename}:UNSAFE_OR_CLIPPED_LAYOUT`);
    if (checks.attempts.length !== 0 || violations.length !== 0)
      throw new Error(
        `${filename}:ISOLATION_VIOLATION:${JSON.stringify({ attempts: checks.attempts, violations })}`,
      );
    if (
      /SYNTHETIC_ONLY|ed25519:|avroqen-vault\.testnet|\/Users\/|\/private\/tmp\/|(?:payment complete|successfully paid|payment succeeded)/i.test(
        checks.text,
      )
    )
      throw new Error(`${filename}:SENSITIVE_OR_MISLEADING_CONTENT`);
    if ((await context.cookies()).length !== 0)
      throw new Error(`${filename}:UNEXPECTED_COOKIE`);

    const temporaryPath = join(publication, filename);
    await page.screenshot({
      path: temporaryPath,
      fullPage: true,
      animations: "disabled",
      scale: "css",
    });
    const bytes = await readFile(temporaryPath);
    const dimensions = validatePng(bytes, width, height);
    results.push({
      filename,
      route: routePath,
      profile,
      viewport: `${width}x${height}`,
      image: `${dimensions.width}x${dimensions.height}`,
      capturedAt: new Date().toISOString(),
      sha256: sha256(bytes),
    });
    await context.close();
  }

  if (results.length !== captures.length)
    throw new Error("CAPTURE_COUNT_NOT_NINE");
  assertSourceProvenance();
  const scriptBytes = await readFile(import.meta.filename);
  const packageJson = JSON.parse(
    await readFile(resolve(ROOT, "node_modules/@playwright/test/package.json")),
  );
  const metadata = {
    ...provenance,
    captureScriptSha256: sha256(scriptBytes),
    baseOrigin: BASE_ORIGIN,
    buildId,
    playwrightVersion: packageJson.version,
    browserVersion,
    os: operatingSystem(),
    requestCounts,
    results,
  };
  await writeFile(join(publication, MANIFEST), manifestText(metadata), {
    encoding: "utf8",
    mode: 0o644,
  });
  await validateStagedSet(publication, metadata);
  await publishSet(publication, metadata);
  console.log(JSON.stringify(metadata, null, 2));
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolveExit) => server.once("exit", resolveExit));
  }
  await rm(evidenceTemporary, { recursive: true, force: true });
  await rm(runtimeTemporary, { recursive: true, force: true });
}
