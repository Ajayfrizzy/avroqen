import { expect, expectTypeOf, it } from "vitest";
import {
  createEngine,
  LIFETIME,
} from "../../scripts/primary-key-verification/core.js";
import type { ProofVerifier } from "../../scripts/primary-key-verification/popup-session.js";
import {
  createPrimaryVerifier,
  type PrimaryVerifier,
} from "../../scripts/primary-key-verification/verify.js";
import { harness, proof } from "../fixtures/primary-key.js";

it("exports the real lookup in the factory contract, not a fixture-added method", () => {
  const h = harness(),
    verifier = createPrimaryVerifier(h.fetcher, h.now);
  expectTypeOf<PrimaryVerifier>().toMatchTypeOf<ProofVerifier>();
  expectTypeOf<
    Omit<PrimaryVerifier, "getChallenge">
  >().not.toMatchTypeOf<ProofVerifier>();
  expectTypeOf<PrimaryVerifier["getChallenge"]>().toEqualTypeOf<
    (id: string) => ReturnType<PrimaryVerifier["issue"]>
  >();
  expect(typeof verifier.getChallenge).toBe("function");
  expect(() => verifier.getChallenge("never-issued")).toThrow(
    "CHALLENGE_UNAVAILABLE",
  );
  expect(h.fetcher).not.toHaveBeenCalled();
});
it("returns the same issued immutable object repeatedly without consuming or replacing it", async () => {
  const h = harness(),
    c = h.engine.issue();
  for (let i = 0; i < 3; i++)
    expect(h.engine.getChallenge(c.challengeId)).toBe(c);
  expect(Object.isFrozen(c)).toBe(true);
  expect(() =>
    Object.assign(c, { nonce: Buffer.alloc(32).toString("base64") }),
  ).toThrow();
  expect(h.fetcher).not.toHaveBeenCalled();
  await expect(
    h.engine.verify(proof(c, h.policy, h.primary)),
  ).resolves.toBeDefined();
});
it("missing lookup never creates or resurrects an entry", () => {
  const h = harness();
  for (let i = 0; i < 3; i++)
    expect(() => h.engine.getChallenge("missing")).toThrow(
      "CHALLENGE_UNAVAILABLE",
    );
  const c = h.engine.issue();
  expect(c.challengeId).not.toBe("missing");
  expect(() => h.engine.getChallenge("missing")).toThrow();
  expect(h.engine.getChallenge(c.challengeId)).toBe(c);
  expect(h.fetcher).not.toHaveBeenCalled();
});
it("lookup cannot extend expiry, refresh nonce or change signed timestamps", () => {
  const h = harness(),
    c = h.engine.issue(),
    snapshot = { ...c };
  h.advance(LIFETIME - 1);
  expect(h.engine.getChallenge(c.challengeId)).toBe(c);
  expect(c).toEqual(snapshot);
  h.advance(1);
  expect(() => h.engine.getChallenge(c.challengeId)).toThrow(
    "CHALLENGE_EXPIRED",
  );
  h.advance(1);
  expect(() => h.engine.getChallenge(c.challengeId)).toThrow(
    "CHALLENGE_EXPIRED",
  );
  expect(c).toEqual(snapshot);
  expect(h.fetcher).not.toHaveBeenCalled();
});
it("cancelled entries stay unavailable despite reads and elapsed time", async () => {
  const h = harness(),
    c = h.engine.issue();
  h.engine.cancel(c.challengeId);
  expect(() => h.engine.getChallenge(c.challengeId)).toThrow(
    "CHALLENGE_UNAVAILABLE",
  );
  h.advance(1);
  expect(() => h.engine.getChallenge(c.challengeId)).toThrow();
  await expect(
    h.engine.verify(proof(c, h.policy, h.primary)),
  ).rejects.toThrow();
  expect(h.fetcher).not.toHaveBeenCalled();
});
it.each([false, true])(
  "rejects lookup while verifying; cancelled mid-flight=%s",
  async (cancel) => {
    const h = harness(),
      c = h.engine.issue();
    const original = h.fetcher.getMockImplementation();
    let release: (() => void) | undefined;
    h.fetcher.mockImplementationOnce(
      (url, options) =>
        new Promise<Response>((resolve, reject) => {
          release = () => {
            if (!original) throw new Error("Missing fixture RPC");
            void original(url, options).then(resolve, reject);
          };
        }),
    );
    const pending = h.engine.verify(proof(c, h.policy, h.primary));
    expect(() => h.engine.getChallenge(c.challengeId)).toThrow(
      "CHALLENGE_UNAVAILABLE",
    );
    if (cancel) h.engine.cancel(c.challengeId);
    if (!release)
      throw new Error("Fixture verification did not claim challenge");
    release();
    if (cancel) await expect(pending).rejects.toThrow();
    else await expect(pending).resolves.toBeDefined();
    expect(() => h.engine.getChallenge(c.challengeId)).toThrow(
      "CHALLENGE_UNAVAILABLE",
    );
  },
);
it.each([false, true])(
  "closed entries cannot be read or replayed; invalid proof=%s",
  async (invalid) => {
    const h = harness(),
      c = h.engine.issue();
    const p = proof(c, h.policy, invalid ? h.testing : h.primary);
    if (invalid) await expect(h.engine.verify(p)).rejects.toThrow();
    else await h.engine.verify(p);
    expect(() => h.engine.getChallenge(c.challengeId)).toThrow(
      "CHALLENGE_UNAVAILABLE",
    );
    await expect(
      h.engine.verify(proof(c, h.policy, h.primary)),
    ).rejects.toThrow("CHALLENGE_UNAVAILABLE");
  },
);
it("cannot look up another instance's challenge even with identical identity policy", () => {
  const h = harness(),
    other = createEngine(h.policy, h.fetcher, h.now);
  const a = h.engine.issue(),
    b = other.issue();
  expect(() => other.getChallenge(a.challengeId)).toThrow(
    "CHALLENGE_UNAVAILABLE",
  );
  expect(() => h.engine.getChallenge(b.challengeId)).toThrow(
    "CHALLENGE_UNAVAILABLE",
  );
  expect(h.engine.getChallenge(a.challengeId)).toBe(a);
  expect(other.getChallenge(b.challengeId)).toBe(b);
});
it("clock rollback cannot make an expired lookup usable again", () => {
  const h = harness(),
    c = h.engine.issue();
  h.advance(LIFETIME);
  expect(() => h.engine.getChallenge(c.challengeId)).toThrow(
    "CHALLENGE_EXPIRED",
  );
  h.advance(-LIFETIME);
  expect(() => h.engine.getChallenge(c.challengeId)).toThrow("CLOCK_INVALID");
  h.advance(LIFETIME);
  expect(() => h.engine.getChallenge(c.challengeId)).toThrow(
    "CHALLENGE_UNAVAILABLE",
  );
});
