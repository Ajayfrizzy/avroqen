import { listInput } from "@avroqen/domain";
import type { FastifyInstance } from "fastify";
import {
  incidentUpdate,
  securityParams,
} from "../../../../packages/domain/src/security.js";
import { sampleLocalHealth } from "../../../../services/security/monitor.js";
import { transitionAllowed } from "../../../../services/security/rules.js";
import type { Context } from "../mandates/routes.js";
export function securityRoutes(app: FastifyInstance, ctx: Context) {
  const base = "/api/organizations/:orgId/security";
  const { transaction, session, membership, deny, pool } = ctx;
  app.get(base, async (request) => {
    const { orgId } = securityParams.parse(request.params),
      { offset } = listInput.parse(request.query);
    return transaction(async (db) => {
      const who = await session(request, db);
      const role = await membership(db, who, orgId, false);
      // Dashboard observations are server-derived and cannot change financial state.
      try {
        await sampleLocalHealth(pool);
      } catch {
        /* Health remains explicitly unavailable below. */
      }
      const alerts = await db.query(
        "SELECT * FROM security_alerts WHERE org_id=$1 ORDER BY last_observed DESC,id LIMIT 50 OFFSET $2",
        [orgId, offset],
      );
      const health = await db.query(
        "SELECT worker,last_success,last_success>clock_timestamp()-interval '1 minute' AS healthy FROM security_worker_health ORDER BY worker",
      );
      const counts = await db.query(
        "SELECT severity,count(*)::int AS count FROM security_alerts WHERE org_id=$1 AND state NOT IN ('RESOLVED','DISMISSED') GROUP BY severity",
        [orgId],
      );
      const states = await db.query(
        "SELECT state,count(*)::int AS count FROM chain_intents WHERE org_id=$1 GROUP BY state",
        [orgId],
      );
      return {
        alerts: alerts.rows,
        counts: counts.rows,
        settlements: states.rows,
        health: health.rows,
        canRespond: ["owner", "admin"].includes(role),
        nextOffset: alerts.rows.length === 50 ? offset + 50 : null,
        notification: "DASHBOARD_ONLY",
      };
    });
  });
  app.get(`${base}/:alertId`, async (request) => {
    const { orgId, alertId } = securityParams.parse(request.params),
      { offset } = listInput.parse(request.query);
    return transaction(async (db) => {
      const who = await session(request, db);
      const role = await membership(db, who, orgId, false);
      const alert = (
        await db.query(
          "SELECT * FROM security_alerts WHERE id=$1 AND org_id=$2",
          [alertId, orgId],
        )
      ).rows[0];
      if (!alert) return deny(404, "INCIDENT_NOT_FOUND");
      const history = await db.query(
        "SELECT action,actor_account,reason,occurred_at,version FROM security_incident_history WHERE alert_id=$1 ORDER BY id DESC LIMIT 100 OFFSET $2",
        [alertId, offset],
      );
      const evidence = await db.query(
        "SELECT e.source,e.source_id,e.event_type,e.reason,e.occurred_at FROM security_alert_evidence a JOIN security_events e ON e.id=a.event_id WHERE a.alert_id=$1 AND e.org_id=$2 ORDER BY e.id DESC LIMIT 100 OFFSET $3",
        [alertId, orgId, offset],
      );
      const ownerActions =
        role === "owner" &&
        Boolean(alert.mandate_id) &&
        (
          await db.query(
            "SELECT 1 FROM mandate_policies WHERE id=$1 AND org_id=$2 AND owner_account=$3",
            [alert.mandate_id, orgId, who.account_id],
          )
        ).rowCount === 1;
      return {
        ownerActions,
        alert,
        history: history.rows,
        evidence: evidence.rows,
        nextOffset:
          Math.max(history.rows.length, evidence.rows.length) === 100
            ? offset + 100
            : null,
      };
    });
  });
  app.post(`${base}/:alertId`, async (request) => {
    const { orgId, alertId } = securityParams.parse(request.params),
      input = incidentUpdate.parse(request.body);
    return transaction(async (db) => {
      const who = await session(request, db, true);
      await membership(db, who, orgId, true);
      const a = (
        await db.query(
          "SELECT * FROM security_alerts WHERE id=$1 AND org_id=$2 FOR UPDATE",
          [alertId, orgId],
        )
      ).rows[0];
      if (!a) return deny(404, "INCIDENT_NOT_FOUND");
      if (a.version !== input.version) return deny(409, "INCIDENT_CHANGED");
      if (
        !transitionAllowed(a.state, input.state) ||
        (["RESOLVED", "DISMISSED"].includes(input.state) && !input.reason)
      )
        return deny(409, "INCIDENT_TRANSITION_DENIED");
      const updated = await db.query(
        "UPDATE security_alerts SET state=$2,assigned_account=$3,resolution_reason=$4,version=version+1 WHERE id=$1 RETURNING *",
        [alertId, input.state, who.account_id, input.reason ?? null],
      );
      await db.query(
        "INSERT INTO security_incident_history(alert_id,action,actor_account,reason,version) VALUES($1,$2,$3,$4,$5)",
        [
          alertId,
          input.state,
          who.account_id,
          input.reason ?? null,
          updated.rows[0].version,
        ],
      );
      return { alert: updated.rows[0], financialStateChanged: false };
    });
  });
}
