import { afterEach, expect, it, vi } from "vitest";
import { createPrimaryVerifier } from "../../scripts/primary-key-verification/verify.js";

const control = vi.hoisted(() => ({
  nonce: undefined as Buffer | undefined,
  id: undefined as string | undefined,
  fail: false,
  sizes: [] as number[],
}));
vi.mock("node:crypto", async (original) => {
  const actual = await original<typeof import("node:crypto")>();
  return {
    ...actual,
    randomBytes: (size: number) => {
      control.sizes.push(size);
      if (control.fail) throw new Error("entropy unavailable");
      return control.nonce ?? actual.randomBytes(size);
    },
    randomUUID: () => control.id ?? actual.randomUUID(),
  };
});
afterEach(() => {
  control.nonce = undefined;
  control.id = undefined;
  control.fail = false;
  control.sizes.length = 0;
});
const engine = () => createPrimaryVerifier(vi.fn(), () => 1_794_074_400_000);
it("uses crypto randomBytes(32) at issuance, never a timestamp or fallback nonce", () => {
  engine().issue();
  expect(control.sizes).toEqual([32]);
  control.fail = true;
  expect(() => engine().issue()).toThrow("entropy unavailable");
});
it("refuses a nonce collision even when UUID differs", () => {
  control.nonce = Buffer.alloc(32, 4);
  const e = engine();
  e.issue();
  expect(() => e.issue()).toThrow("RANDOM_COLLISION");
});
it("refuses an ID collision even when entropy differs", () => {
  control.id = "00000000-0000-4000-8000-000000000001";
  const e = engine();
  e.issue();
  expect(() => e.issue()).toThrow("RANDOM_COLLISION");
});
