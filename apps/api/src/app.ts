/**
 * Fastify application factory — every concern is attached here exactly once.
 * `server.ts` only calls buildApp() then listens; app.ts stays testable.
 */
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError, type ZodIssue } from "zod";
import { env, parseCorsOrigins } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { healthRoutes } from "./routes/health.js";
import { productRoutes } from "./routes/products.js";
import { orderRoutes } from "./routes/orders.js";
import { storefrontRoutes } from "./routes/storefront.js";
import { adminRoutes } from "./routes/admin.js";
import { partnerRoutes } from "./routes/partner.js";
import { razorpayWebhookRoutes } from "./routes/webhooks/razorpay.js";
import { cashfreeWebhookRoutes } from "./routes/webhooks/cashfree.js";
import { demoPaymentRoutes } from "./routes/demo-payment.js";

/** Normalizes any thrown value into { statusCode, code, message, details }. */
function normalizeError(err: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      code: "SCHEMA_VALIDATION",
      message: "Request payload failed validation",
      details: err.issues.map((i: ZodIssue) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const status = (err as { statusCode?: number }).statusCode;
  const code = (err as { code?: string }).code;
  return {
    statusCode: typeof status === "number" && status >= 400 ? status : 500,
    code: typeof code === "string" ? code : "INTERNAL_ERROR",
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err instanceof Error
          ? err.message
          : String(err),
  };
}

export async function buildApp(): Promise<FastifyInstance> {
  const e = env();

  const app = Fastify({
    logger: {
      level: e.LOG_LEVEL,
      ...(e.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
            },
          }
        : {}),
    },
    trustProxy: true,
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 512 * 1024,
    ajv: { customOptions: { removeAdditional: "all" } },
  });

  /* ------------------------- Global error handler ------------------------ */
  app.setErrorHandler((err, req, reply) => {
    const normalized = normalizeError(err);
    if (normalized.statusCode >= 500) {
      req.log.error({ err, requestId: req.id }, "unhandled error");
    } else {
      req.log.warn({ code: normalized.code, requestId: req.id }, normalized.message);
    }
    void reply.status(normalized.statusCode).send({
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details !== undefined ? { details: normalized.details } : {}),
        requestId: req.id,
      },
    });
  });

  // Uncaught route rejection safety net (prevents process crash on async throws).
  app.setErrorHandler; // error handler above covers async rejections in Fastify v5

  app.setNotFoundHandler((req, reply) => {
    void reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `No route for ${req.method} ${req.url}`,
        requestId: req.id,
      },
    });
  });

  /* ---------------------- Raw-body capture (webhooks) --------------------- */
  /**
   * Replace the default JSON parser with one that keeps the untouched
   * raw buffer on `request.rawBody` — required for byte-exact HMAC
   * signature verification on payment webhooks. Malformed JSON still
   * fails fast with the standard 400 payload.
   */
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer;
      const text = (body as Buffer).toString("utf8");
      if (!text.trim()) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  /* ------------------------------ Plugins ------------------------------ */
  await app.register(cors, {
    origin: parseCorsOrigins(e.CORS_ORIGINS),
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
    maxAge: 86400,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // API only; CSP belongs at the edge/web
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(rateLimit, {
    global: false, // applied per-route where it matters (checkout, webhooks off)
    max: 100,
    timeWindow: "1 minute",
  });

  /* ------------------------------- Routes ------------------------------ */
  const registerRoutes: FastifyPluginAsync = async (instance) => {
    await instance.register(healthRoutes);
    await instance.register(productRoutes);
    await instance.register(orderRoutes);
    await instance.register(storefrontRoutes);
    await instance.register(adminRoutes);
    await instance.register(partnerRoutes);
    // Webhooks last & isolated — they must never inherit global rate limits.
    await instance.register(razorpayWebhookRoutes);
    await instance.register(cashfreeWebhookRoutes);
    // Dev-only demo payment confirm (no-ops itself when disabled).
    await instance.register(demoPaymentRoutes);
  };
  await app.register(registerRoutes, { prefix: "" });

  /* ------------------------------ Lifecycle ----------------------------- */
  app.addHook("onClose", async () => {
    app.log.info("crunchrr-api shutting down");
  });

  return app;
}
