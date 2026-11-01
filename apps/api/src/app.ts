import Fastify from "fastify";
export function buildApi(checkDatabase: () => Promise<void>) {
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    requestTimeout: 5000,
  });
  app.get("/health", async () => ({
    status: "alive",
    stage: "foundation",
    paymentsEnabled: false,
  }));
  app.get("/ready", async (_request, reply) => {
    try {
      await checkDatabase();
      return { status: "ready", scope: "database-connectivity-only" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  return app;
}
