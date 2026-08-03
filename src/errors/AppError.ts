export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = "APP_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export const NotFound = (msg = "Resource not found") => new AppError(404, msg, "NOT_FOUND");
export const BadRequest = (msg = "Invalid request", details?: unknown) =>
  new AppError(400, msg, "BAD_REQUEST", details);
export const Unauthorized = (msg = "Unauthorized") => new AppError(401, msg, "UNAUTHORIZED");
export const Forbidden = (msg = "Forbidden") => new AppError(403, msg, "FORBIDDEN");