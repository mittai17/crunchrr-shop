/**
 * Structured Fastify error types with stable machine-readable codes.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** When true the error is expected and safe to log at warn level. */
  readonly operational = true;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, "NOT_FOUND", `${resource}${id ? ` '${id}'` : ""} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, "VALIDATION_ERROR", message, details);
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class PaymentError extends AppError {
  constructor(message: string, details?: unknown) {
    super(502, "PAYMENT_PROVIDER_ERROR", message, details);
  }
}

export class PartnerError extends AppError {
  constructor(partner: string, message: string, details?: unknown) {
    super(502, "PARTNER_ERROR", `${partner}: ${message}`, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}
