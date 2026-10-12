import type { ZodType } from "zod";

// Catatan tentang middleware yang dipasang di route, dibaca oleh pembangkit
// dokumentasi OpenAPI. Middleware tetap berjalan persis seperti biasa;
// WeakMap hanya mengingat skema dan hak akses yang dipakainya, sehingga
// dokumentasi selalu mengikuti route yang sebenarnya tanpa ditulis ulang

export type RequestPart = "body" | "query" | "params";

type Handler = (...args: never[]) => unknown;

const schemas = new WeakMap<Handler, { part: RequestPart; schema: ZodType }>();
const features = new WeakMap<Handler, string>();
const roles = new WeakMap<Handler, string[]>();
const uploads = new WeakMap<Handler, string>();

export function markSchema<T extends Handler>(
  handler: T,
  part: RequestPart,
  schema: ZodType,
): T {
  schemas.set(handler, { part, schema });
  return handler;
}

export function markFeature<T extends Handler>(handler: T, code: string): T {
  features.set(handler, code);
  return handler;
}

export function markRoles<T extends Handler>(handler: T, allowed: string[]): T {
  roles.set(handler, allowed);
  return handler;
}

export function markUpload<T extends Handler>(handler: T, field: string): T {
  uploads.set(handler, field);
  return handler;
}

export function schemaOf(handler: Handler) {
  return schemas.get(handler);
}

export function featureOf(handler: Handler) {
  return features.get(handler);
}

export function rolesOf(handler: Handler) {
  return roles.get(handler);
}

export function uploadFieldOf(handler: Handler) {
  return uploads.get(handler);
}
