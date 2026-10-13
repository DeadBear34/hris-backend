import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { buildOpenApiDocument } from "../docs/openapi.js";
import { getApiRouter } from "../docs/registry.js";

// Dibangun sekali per proses. Route tidak berubah selama server berjalan,
// jadi tidak perlu menelusurinya ulang di setiap permintaan
let cached: ReturnType<typeof buildOpenApiDocument> | null = null;

export function OpenApiDocumentController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    cached ??= buildOpenApiDocument(getApiRouter(), {
      environment: env.NODE_ENV,
    });

    // Dokumen hanya untuk pengguna berhak, jadi tidak boleh tersimpan di
    // cache browser, proxy, maupun Cloudflare
    res.set("Cache-Control", "no-store");
    res.json(cached);
  } catch (err) {
    next(err);
  }
}
