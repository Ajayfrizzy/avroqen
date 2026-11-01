import { expect, it } from "vitest";
import { buildApi } from "../../apps/api/src/app.js";

it("separates liveness from database readiness, including recovery", async () => {
  let healthy = true;
  const api = buildApi(async () => {
    if (!healthy) throw new Error("private connection detail");
  });
  try {
    expect((await api.inject("/health")).statusCode).toBe(200);
    expect((await api.inject("/ready")).statusCode).toBe(200);
    healthy = false;
    expect((await api.inject("/health")).statusCode).toBe(200);
    const response = await api.inject("/ready");
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("private connection detail");
    healthy = true;
    expect((await api.inject("/ready")).statusCode).toBe(200);
  } finally {
    await api.close();
  }
});

it("exposes no payment or authorization endpoints", async () => {
  const api = buildApi(async () => {});
  try {
    for (const url of ["/transfer", "/withdraw", "/approve", "/v1/proposals"]) {
      expect(
        (await api.inject({ method: "POST", url, payload: { approved: true } }))
          .statusCode,
      ).toBe(404);
    }
  } finally {
    await api.close();
  }
});
