/**
 * Crunchrr API — process bootstrap.
 * Responsibilities are deliberately tiny: parse env, build app, listen,
 * wire graceful shutdown. All wiring lives in app.ts.
 */
import "dotenv/config";
import { loadServerEnv } from "@crunchrr/shared";
import { buildApp } from "./app.js";
import { startDispatchRetryWorker } from "./services/orders.js";
import { startFxRefreshWorker } from "./services/fx.js";

async function main(): Promise<void> {
  const env = loadServerEnv();

  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "received shutdown signal");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    app.log.error({ reason }, "unhandled rejection (process kept alive)");
  });

  // Smart Ops — sweep REJECTED splits and re-dispatch (capped attempts).
  startDispatchRetryWorker();
  // FX hygiene — refresh zone rates from the market (drift-guarded, audited).
  startFxRefreshWorker();

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
  } catch (err) {
    app.log.error({ err }, "failed to start crunchrr-api");
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal bootstrap failure:", err);
  process.exit(1);
});
