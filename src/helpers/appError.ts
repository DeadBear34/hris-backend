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

export function BadRequest(
  message = "Permintaan tidak valid",
  details?: unknown,
) {
  return new AppError(400, message, "BAD_REQUEST", details);
}

export function Unauthorized(message = "Autentikasi diperlukan") {
  return new AppError(401, message, "UNAUTHORIZED");
}

export function Forbidden(message = "Akses ditolak") {
  return new AppError(403, message, "FORBIDDEN");
}

export function NotFound(message = "Data tidak ditemukan") {
  return new AppError(404, message, "NOT_FOUND");
}

export function Conflict(message = "Data sudah ada", details?: unknown) {
  return new AppError(409, message, "CONFLICT", details);
}

export function TooManyRequests(
  message = "Terlalu banyak permintaan, coba lagi nanti",
  details?: unknown,
) {
  return new AppError(429, message, "TOO_MANY_REQUESTS", details);
}
