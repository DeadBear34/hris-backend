import { jest, describe, it, expect } from "@jest/globals";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

const { default: router } = await import("../../src/route/route.js");
const { collectRoutes, buildOpenApiDocument } =
  await import("../../src/docs/openapi.js");
const { ROUTE_DOCS } = await import("../../src/docs/routeDocs.js");

type Operation = Record<string, any>;

const routes = collectRoutes(router);
const doc = buildOpenApiDocument(router, {
  environment: "production",
}) as Record<string, any>;

function op(method: string, path: string): Operation {
  return doc.paths[path][method];
}

describe("cakupan dokumentasi", () => {
  // Tes ini gagal bila ada route baru yang lupa diberi teks di routeDocs.ts
  it("setiap route punya teks di ROUTE_DOCS", () => {
    const missing = routes
      .map((r) => `${r.method} ${r.path}`)
      .filter((key) => !ROUTE_DOCS[key]);

    expect(missing).toEqual([]);
  });

  it("tidak ada teks untuk route yang sudah tidak ada", () => {
    const existing = new Set(routes.map((r) => `${r.method} ${r.path}`));
    const stale = Object.keys(ROUTE_DOCS).filter((key) => !existing.has(key));

    expect(stale).toEqual([]);
  });

  it("setiap route menjadi satu operasi", () => {
    const operations = Object.values(
      doc.paths as Record<string, Operation>,
    ).reduce((n, item) => n + Object.keys(item).length, 0);

    expect(operations).toBe(routes.length);
    expect(routes.length).toBeGreaterThanOrEqual(84);
  });

  it("parameter path ditulis dengan gaya OpenAPI", () => {
    expect(doc.paths["/leave-requests/{id}/approve"]).toBeDefined();
    expect(Object.keys(doc.paths).some((p) => p.includes(":"))).toBe(false);
  });
});

describe("dibaca otomatis dari route", () => {
  it("endpoint terlindungi memakai bearer token", () => {
    expect(op("get", "/auth/me").security).toEqual([{ bearerAuth: [] }]);
  });

  it("endpoint publik tanpa keamanan", () => {
    expect(op("post", "/auth/login").security).toEqual([]);
  });

  it("job penutup hari memakai header rahasia cron", () => {
    expect(op("post", "/attendances/close-day").security).toEqual([
      { cronSecret: [] },
    ]);
  });

  it("fitur yang dibutuhkan dibaca dari requireFeature", () => {
    expect(op("post", "/employees")["x-required-feature"]).toBe(
      "employee.create",
    );
    expect(op("get", "/activity-logs")["x-required-feature"]).toBe(
      "system.view_log",
    );
  });

  it("role yang dibutuhkan dibaca dari authorize", () => {
    expect(op("get", "/features")["x-required-roles"]).toEqual(["admin"]);
  });

  it("unggahan berkas memakai multipart/form-data dengan nama field yang benar", () => {
    const body = op("post", "/leave-requests/{id}/attachments").requestBody
      .content["multipart/form-data"].schema;

    expect(body.required).toEqual(["file"]);
    expect(body.properties.file.format).toBe("binary");
  });

  it("aturan password kuat ikut terdokumentasi dari skema", () => {
    const password = op("post", "/auth/register").requestBody.content[
      "application/json"
    ].schema.properties.password;

    expect(password.minLength).toBe(8);
    expect(password.maxLength).toBe(72);
    expect(JSON.stringify(password)).toContain("[^A-Za-z0-9\\\\s]");
  });

  it("parameter query wajib ditandai required", () => {
    const params = op("get", "/leave-requests/department-calendar").parameters;
    const byName = Object.fromEntries(
      params.map((p: any) => [p.name, p.required]),
    );

    expect(byName).toEqual({
      start_date: true,
      end_date: true,
      department_id: false,
    });
  });

  it("kode error khusus endpoint ikut tercantum", () => {
    expect(
      op("post", "/leave-requests").responses["409"].description,
    ).toContain("STAFFING_LIMIT_REACHED");
  });

  it("status sukses mengikuti dokumentasi", () => {
    expect(op("post", "/departments").responses["201"]).toBeDefined();
    expect(op("get", "/departments").responses["200"]).toBeDefined();
  });

  it("skema dirapikan: tanpa $schema dan tanpa pola regex di samping format", () => {
    const text = JSON.stringify(doc);

    expect(text).not.toContain('"$schema"');
    expect(text).not.toContain("9007199254740991");
  });
});

describe("pengaturan Try it out", () => {
  it("production hanya mengizinkan GET", () => {
    expect(doc["x-try-it-out-methods"]).toEqual(["get"]);
    expect(doc.info.description).toContain("hanya permintaan GET");
  });

  it("development mengizinkan semua method", () => {
    const dev = buildOpenApiDocument(router, {
      environment: "development",
    }) as Record<string, any>;

    expect(dev["x-try-it-out-methods"]).toEqual([
      "get",
      "post",
      "put",
      "patch",
      "delete",
    ]);
  });

  it("menyebut header penanda percobaan", () => {
    expect(doc["x-try-it-out-header"]).toBe("x-api-docs-try-it-out");
  });

  it("server relatif terhadap domain API", () => {
    expect(doc.servers).toEqual([
      { url: "/api/v1", description: "Server ini" },
    ]);
  });
});
