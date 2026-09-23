export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function BadRequest(message = "Invalid request", details?: unknown) {
  return new AppError(400, message, "BAD_REQUEST", details);
}

export function Unauthorized(message = "Authentication required") {
  return new AppError(401, message, "UNAUTHORIZED");
}

export function Forbidden(message = "Access denied", details?: unknown) {
  return new AppError(403, message, "FORBIDDEN", details);
}

export function NotFound(message = "Data not found") {
  return new AppError(404, message, "NOT_FOUND");
}

export function Conflict(message = "Data already exists", details?: unknown) {
  return new AppError(409, message, "CONFLICT", details);
}

export function TooManyRequests(
  message = "Too many requests, please try again later",
  details?: unknown,
) {
  return new AppError(429, message, "TOO_MANY_REQUESTS", details);
}

// Dibedakan dari TOO_MANY_REQUESTS: yang itu jeda aturan bisnis (misalnya
// menunggu sebelum meminta kode verifikasi baru), sedangkan ini batas
// jumlah panggilan API per klien
export function RateLimitExceeded(message = "Too many requests") {
  return new AppError(429, message, "RATE_LIMIT_EXCEEDED");
}
