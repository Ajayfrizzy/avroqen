// Static regression boundary, not a JavaScript sandbox. Never evaluates inspected code.

import { createRequire } from "node:module";
import { posix } from "node:path";

// Reuse the parser shipped by the pinned Next dependency. No inspected code runs.
const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
interface Node {
  type: string;
  [key: string]: unknown;
}
const { parse } = webRequire("next/dist/compiled/babel/parser") as {
  parse(
    source: string,
    options: { sourceType: "module"; plugins: string[] },
  ): Node;
};
const node = (value: unknown) => value as Node;
const name = (value: unknown) => String(node(value).name ?? node(value).value);

const demo = "apps/web/app/demo/";
const ui = "apps/web/app/components/ui.tsx";
const amounts = "packages/domain/src/index.ts";
const libraries: Record<string, readonly string[]> = {
  react: ["ReactNode", "useState", "useEffect", "useRef"],
  "next/link": ["default"],
  "next/navigation": ["usePathname", "notFound"],
};
const primitives = [
  "Badge",
  "Card",
  "Dialog",
  "Feedback",
  "Icon",
  "Metric",
  "PageHeader",
  "TechnicalDetails",
  "Timeline",
  "TransactionSummary",
];
const denied = new Set([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "WebTransport",
  "window",
  "document",
  "navigator",
  "globalThis",
  "self",
  "global",
  "process",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "cookie",
  "eval",
  "Function",
  "require",
  "constructor",
  "__proto__",
  "Worker",
  "SharedWorker",
  "WebAssembly",
  "crypto",
  "Buffer",
  "useServer",
  "dangerouslySetInnerHTML",
  "onSubmit",
  "formAction",
  "srcDoc",
  "action",
  "location",
  "open",
  "postMessage",
  "sendBeacon",
  "Image",
  "Audio",
  "Reflect",
  "setTimeout",
  "setInterval",
  "requestIdleCallback",
]);

export function assertSampleIsolation(sources: ReadonlyMap<string, string>) {
  if (!sources.size) throw new Error("SAMPLE_SOURCE_MISSING");
  for (const [file, source] of sources) {
    if (!file.startsWith(demo) || !/\.(ts|tsx)$/.test(file))
      throw new Error("SAMPLE_SOURCE_PATH");
    if (/\/(?:route|middleware|proxy)\.[^.]+$/.test(file))
      throw new Error("SAMPLE_SERVER_HANDLER");
    const tree = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    function visit(current: Node) {
      if (
        [
          "ImportDeclaration",
          "ExportNamedDeclaration",
          "ExportAllDeclaration",
        ].includes(current.type) &&
        current.source
      ) {
        const specifier = name(current.source);
        let allowed = libraries[specifier];
        if (!allowed) {
          const base = posix
            .normalize(posix.join(posix.dirname(file), specifier))
            .replace(/\.js$/, "");
          const target = [base, `${base}.ts`, `${base}.tsx`].find(
            (p) => sources.has(p) || p === ui || p === amounts,
          );
          if (!specifier.startsWith(".") || !target)
            throw new Error("SAMPLE_IMPORT");
          if (target === ui) allowed = primitives;
          // One reviewed pure export only. No production object/schema imports.
          if (target === amounts) allowed = ["atomicToNear"];
        }
        const bindings = current.specifiers as Node[];
        if (current.type !== "ImportDeclaration") {
          if (allowed || current.type === "ExportAllDeclaration")
            throw new Error("SAMPLE_IMPORT");
        } else {
          if (
            !bindings.length ||
            bindings.some((b) => b.type === "ImportNamespaceSpecifier")
          )
            throw new Error("SAMPLE_IMPORT");
          const names = bindings.map((b) =>
            b.type === "ImportDefaultSpecifier" ? "default" : name(b.imported),
          );
          if (allowed && names.some((n) => !allowed.includes(n)))
            throw new Error("SAMPLE_IMPORT");
        }
      }
      if (
        ["Import", "ImportExpression", "TSImportEqualsDeclaration"].includes(
          current.type,
        )
      )
        throw new Error("SAMPLE_DYNAMIC_IMPORT");
      if (
        ["Identifier", "JSXIdentifier"].includes(current.type) &&
        denied.has(String(current.name))
      )
        throw new Error("SAMPLE_CAPABILITY");
      if (current.computed === true) throw new Error("SAMPLE_COMPUTED_ACCESS");
      if (current.type === "Directive" && name(current.value) === "use server")
        throw new Error("SAMPLE_SERVER_ACTION");
      if (
        ["JSXOpeningElement"].includes(current.type) &&
        /^(script|iframe|object|embed|form|input|textarea|select|img|audio|video|source|link|style|meta|base)$/i.test(
          name(current.name),
        )
      )
        throw new Error("SAMPLE_ACTIVE_MARKUP");
      if (current.type === "JSXAttribute" && name(current.name) === "href") {
        const value = current.value;
        // Literal navigation only until a separately reviewed renderer exists.
        if (
          !value ||
          node(value).type !== "StringLiteral" ||
          !(
            name(value) === "#demo-content" ||
            /^\/(?:demo(?:\/(?:mandate|proposal|review|outcomes|evidence))?)?$/.test(
              name(value),
            )
          )
        )
          throw new Error("SAMPLE_LINK");
      }
      for (const child of Object.values(current)) {
        if (Array.isArray(child)) {
          for (const entry of child)
            if (entry && typeof entry === "object") visit(node(entry));
        } else if (child && typeof child === "object") visit(node(child));
      }
    }
    visit(tree);
  }
}
