import { readFileSync } from "node:fs";
import { join } from "node:path";

// Versi aplikasi diambil dari package.json, satu-satunya tempat versi ditulis.
// Dibaca dari folder kerja proses: root repo saat development dan test, /app
// di image Docker (Dockerfile menyalin package.json ke sana).
// Arti nomor versi dijelaskan di docs.hris.click/versioning, langkah rilis di
// CHANGELOG.md dan RELEASING.md repositori hris-docs
function readVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const version = (JSON.parse(raw) as { version?: unknown }).version;

    return typeof version === "string" ? version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const APP_VERSION = readVersion();
