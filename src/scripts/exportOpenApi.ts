import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Menulis dokumen OpenAPI ke berkas, untuk halaman Referensi API di
// docs.hris.click. Satu berkas per versi rilis, misalnya:
//   npm run docs:openapi -- ../hris-docs/static/openapi/0.7.1.json
// Tanpa argumen, berkas ditulis ke openapi-<versi>.json di folder kerja.
//
// Tidak menyambung ke database maupun Redis: route hanya ditelusuri. env.ts
// mewajibkan beberapa variabel saat dimuat, jadi nilai tiruan diisi bila
// kosong sebelum modul aplikasi diimpor
process.env.DATABASE_URL ??=
  "postgres://openapi:openapi@localhost:5432/openapi";
process.env.JWT_SECRET ??= "openapi-export-only-not-a-real-secret-value";
process.env.LOG_LEVEL ??= "silent";
process.env.REDIS_URL = "";

async function main(): Promise<void> {
  const { APP_VERSION } = await import("../config/version.js");
  const { buildOpenApiDocument } = await import("../docs/openapi.js");
  const { getApiRouter } = await import("../docs/registry.js");
  // mendaftarkan router utama ke registry
  await import("../route/route.js");

  const target = resolve(process.argv[2] ?? `openapi-${APP_VERSION}.json`);

  // production: dokumen yang sama dengan yang dilihat di server production
  const document = buildOpenApiDocument(getApiRouter(), {
    environment: "production",
  });

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);

  const paths = Object.keys(document.paths).length;
  console.log(`OpenAPI ${APP_VERSION}: wrote ${paths} paths to ${target}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to export the OpenAPI document:", err);
    process.exit(1);
  });
