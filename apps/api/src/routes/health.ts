import type { FastifyInstance } from "fastify";
import { healthResponseSchema } from "@crunchrr/shared";
import { env } from "../config/env.js";
import { pingDb } from "../services/orders.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/health",
    {
      schema: {
        response: { 200: { content: { "application/json": { schema: {} } } } },
      },
    },
    async (_req, reply) => {
      const db = await pingDb();
      const payload = healthResponseSchema.parse({
        status: "ok",
        service: "crunchrr-api",
        version: "0.1.0",
        uptimeSeconds: Math.floor(process.uptime()),
        db,
      });
      return reply.send(payload);
    },
  );
}
