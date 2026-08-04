export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function BadRequest(message = "Permintaan tidak valid") {
  return new AppError(400, message, "BAD_REQUEST");
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

export function Conflict(message = "Data sudah ada") {
  return new AppError(409, message, "CONFLICT");
}