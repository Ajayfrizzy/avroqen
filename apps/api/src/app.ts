import Fastify from "fastify";
import { type IdentityOptions, identityRoutes } from "./identity/routes.js";
export interface OperationalHealth {
  deploymentManifestConfigured: boolean;
  financialSubmissionEnabled: boolean;
}
export function buildApi(
  checkDatabase: () => Promise<void>,
  identity?: IdentityOptions,
  operational: OperationalHealth = {
    deploymentManifestConfigured: Boolean(identity?.chain?.manifest),
    financialSubmissionEnabled:
      identity?.chain?.submissionEnabled === true &&
      Boolean(identity.chain.manifest),
  },
) {
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    requestTimeout: 5000,
  });
  app.get("/health", async () => {
    const manifestConfigured = operational.deploymentManifestConfigured;
    return {
      status: "alive",
      stage: "foundation",
      financial: {
        configurationReady: manifestConfigured,
        readOnlyVerificationConfigured: manifestConfigured,
        submissionEnabled:
          manifestConfigured && operational.financialSubmissionEnabled,
      },
    };
  });
  app.get("/ready", async (_request, reply) => {
    try {
      await checkDatabase();
      return { status: "ready", scope: "database-connectivity-only" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  if (identity) app.register(async (scope) => identityRoutes(scope, identity));
  return app;
}
