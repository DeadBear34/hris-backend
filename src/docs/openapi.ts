import { z, type ZodType } from "zod";
import { authenticate } from "../middlewares/auth.js";
import { ROUTE_DOCS, TAGS, type ErrorDoc } from "./routeDocs.js";
import { featureOf, rolesOf, schemaOf, uploadFieldOf } from "./routeMeta.js";
import { APP_VERSION } from "../config/version.js";

// Membangkitkan dokumen OpenAPI 3.1 dengan menelusuri router Express yang
// sebenarnya. Path, method, autentikasi, hak akses, parameter, dan body
// semuanya dibaca dari route dan middleware yang terpasang, jadi dokumen ini
// tidak mungkin berbeda dari perilaku server

type Handler = (...args: never[]) => unknown;

interface ExpressLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: Handler }[];
  };
  handle?: { stack?: ExpressLayer[] };
}

export interface CollectedRoute {
  method: string;
  path: string;
  handlers: Handler[];
}

export const TRY_IT_OUT_HEADER = "x-api-docs-try-it-out";

// Menelusuri router beserta sub-router yang dipasang dengan router.use().
// Semua sub-router di project ini dipasang di akar, jadi path route sudah
// merupakan path lengkapnya
export function collectRoutes(router: unknown): CollectedRoute[] {
  const stack = (router as { stack?: ExpressLayer[] }).stack ?? [];
  const routes: CollectedRoute[] = [];

  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({
          method: method.toUpperCase(),
          path: layer.route.path,
          handlers: layer.route.stack.map((entry) => entry.handle),
        });
      }
    } else if (layer.handle?.stack) {
      routes.push(...collectRoutes(layer.handle));
    }
  }

  return routes;
}

type JsonSchema = Record<string, unknown>;

// Membersihkan JSON Schema hasil Zod supaya enak dibaca: pola regex panjang
// untuk tanggal/UUID/email sudah diwakili "format", dan batas bilangan bulat
// maksimum JavaScript tidak berarti apa-apa bagi pembaca
function tidy(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(tidy);
  if (!schema || typeof schema !== "object") return schema;

  const result: JsonSchema = {};

  for (const [key, value] of Object.entries(schema as JsonSchema)) {
    if (key === "$schema") continue;
    if (key === "pattern" && (schema as JsonSchema).format) continue;
    if (
      (key === "maximum" && value === Number.MAX_SAFE_INTEGER) ||
      (key === "minimum" && value === Number.MIN_SAFE_INTEGER)
    )
      continue;
    result[key] = tidy(value);
  }

  return result;
}

export function toJsonSchema(schema: ZodType): JsonSchema {
  return tidy(
    z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
  ) as JsonSchema;
}

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z_]+)/g, "{$1}");
}

function pathParamNames(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z_]+)/g)].map((match) => match[1]!);
}

const json = (schema: JsonSchema) => ({ "application/json": { schema } });
const ERROR_REF = { $ref: "#/components/schemas/ErrorResponse" };
const VALIDATION_REF = { $ref: "#/components/schemas/ValidationErrorResponse" };

function buildResponses(options: {
  successStatus: number;
  rawResponse: boolean;
  validated: boolean;
  authenticated: boolean;
  restricted: boolean;
  hasPathParams: boolean;
  cron: boolean;
  errors: ErrorDoc[];
}) {
  const responses: Record<string, unknown> = {
    [String(options.successStatus)]: {
      description: "Success",
      content: json(
        options.rawResponse
          ? { type: "object" }
          : { $ref: "#/components/schemas/SuccessResponse" },
      ),
    },
  };

  const add = (
    status: number,
    description: string,
    schema: JsonSchema = ERROR_REF,
  ) => {
    const key = String(status);
    const existing = responses[key] as { description: string } | undefined;
    responses[key] = existing
      ? { ...existing, description: `${existing.description}. ${description}` }
      : { description, content: json(schema) };
  };

  if (options.validated)
    add(
      400,
      "Validation failed (VALIDATION_ERROR), per-field details in errors[]",
      VALIDATION_REF,
    );
  if (options.authenticated)
    add(
      401,
      "Not signed in, or the token is invalid or expired (UNAUTHORIZED)",
    );
  if (options.cron) {
    add(401, "Wrong x-cron-secret header (UNAUTHORIZED)");
    add(403, "CRON_SECRET is not configured on the server (FORBIDDEN)");
  }
  if (options.restricted)
    add(403, "Missing permission, see details.required_feature (FORBIDDEN)");
  if (options.hasPathParams) add(404, "Record not found (NOT_FOUND)");

  for (const error of options.errors) {
    add(error.status, `${error.description} (${error.code})`);
  }

  add(
    429,
    "Too many requests, wait for the Retry-After header (RATE_LIMIT_EXCEEDED)",
  );

  return responses;
}

function buildOperation(route: CollectedRoute) {
  const key = `${route.method} ${route.path}`;
  const doc = ROUTE_DOCS[key];

  const metas = route.handlers
    .map((handler) => schemaOf(handler))
    .filter(Boolean);
  const bodySchema = metas.find((meta) => meta!.part === "body")?.schema;
  const querySchema = metas.find((meta) => meta!.part === "query")?.schema;
  const paramsSchema = metas.find((meta) => meta!.part === "params")?.schema;

  const authenticated = route.handlers.includes(
    authenticate as unknown as Handler,
  );
  const feature = route.handlers.map(featureOf).find(Boolean);
  const roles = route.handlers.map(rolesOf).find(Boolean);
  const uploadField = route.handlers.map(uploadFieldOf).find(Boolean);
  const cron = doc?.security === "cron";

  // Parameter path dan query
  const parameters: Record<string, unknown>[] = [];
  const paramProps = (
    paramsSchema ? toJsonSchema(paramsSchema).properties : {}
  ) as Record<string, JsonSchema>;

  for (const name of pathParamNames(route.path)) {
    parameters.push({
      name,
      in: "path",
      required: true,
      schema: paramProps[name] ?? { type: "string" },
    });
  }

  if (querySchema) {
    const query = toJsonSchema(querySchema);
    const required = new Set((query.required as string[] | undefined) ?? []);

    for (const [name, schema] of Object.entries(
      (query.properties ?? {}) as Record<string, JsonSchema>,
    )) {
      parameters.push({
        name,
        in: "query",
        required: required.has(name),
        schema,
      });
    }
  }

  // Body
  let requestBody: Record<string, unknown> | undefined;

  if (uploadField) {
    requestBody = {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              [uploadField]: {
                type: "string",
                format: "binary",
                description: "JPG, PNG, or WebP image, up to 5 MB",
              },
            },
            required: [uploadField],
          },
        },
      },
    };
  } else if (doc?.body ?? bodySchema) {
    requestBody = {
      required: true,
      content: json(toJsonSchema((doc?.body ?? bodySchema)!)),
    };
  }

  // Hak akses dalam kalimat, ditaruh di deskripsi supaya terbaca di UI
  const access = cron
    ? "`x-cron-secret` header"
    : roles
      ? `Role: ${roles.join(", ")}`
      : feature
        ? `Feature \`${feature}\` (administrators hold every feature)`
        : authenticated
          ? "Signed-in user"
          : "Public, no token required";

  const operation: Record<string, unknown> = {
    tags: [doc?.tag ?? "Other"],
    summary: doc?.summary ?? key,
    description: [doc?.description, `**Access:** ${access}`]
      .filter(Boolean)
      .join("\n\n"),
    operationId: `${route.method.toLowerCase()}${route.path.replace(/[/:-]+(\w)/g, (_m, c: string) => c.toUpperCase())}`,
    security: cron
      ? [{ cronSecret: [] }]
      : authenticated
        ? [{ bearerAuth: [] }]
        : [],
    responses: buildResponses({
      successStatus: doc?.status ?? 200,
      rawResponse: doc?.rawResponse ?? false,
      validated: Boolean(
        bodySchema || querySchema || paramsSchema || uploadField,
      ),
      authenticated,
      restricted: Boolean(feature || roles),
      hasPathParams: pathParamNames(route.path).length > 0,
      cron,
      errors: doc?.errors ?? [],
    }),
  };

  if (parameters.length > 0) operation.parameters = parameters;
  if (requestBody) operation.requestBody = requestBody;
  if (feature) operation["x-required-feature"] = feature;
  if (roles) operation["x-required-roles"] = roles;
  if (!doc) operation["x-undocumented"] = true;

  return operation;
}

export interface OpenApiOptions {
  environment: string;
}

export function buildOpenApiDocument(router: unknown, options: OpenApiOptions) {
  const production = options.environment === "production";
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of collectRoutes(router)) {
    const path = openApiPath(route.path);
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = buildOperation(route);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "HRIS Backend API",
      version: APP_VERSION,
      description: [
        "Generated from the backend routes and validation schemas, so it always matches the running server.",
        "",
        "- Authentication: `Authorization: Bearer <token>` header, with the token from `POST /auth/login`.",
        "- Success: `{ success: true, message?, data, meta? }`. Error: `{ success: false, message, code, details?, errors? }`.",
        "- General rate limit: 300 requests per minute per user.",
        production
          ? "- **Production:** only GET requests can be tried from this page."
          : "- Every method can be tried from this page.",
      ].join("\n"),
    },
    servers: [{ url: "/api/v1", description: "This server" }],
    tags: TAGS,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        cronSecret: { type: "apiKey", in: "header", name: "x-cron-secret" },
      },
      schemas: {
        SuccessResponse: {
          type: "object",
          required: ["success"],
          properties: {
            success: { type: "boolean", const: true },
            message: { type: "string" },
            data: {},
            meta: {
              type: "object",
              properties: {
                page: { type: "integer" },
                limit: { type: "integer" },
                total: { type: "integer" },
                total_pages: { type: "integer" },
              },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          required: ["success", "message"],
          properties: {
            success: { type: "boolean", const: false },
            message: { type: "string" },
            code: {
              type: "string",
              examples: [
                "BAD_REQUEST",
                "UNAUTHORIZED",
                "FORBIDDEN",
                "NOT_FOUND",
                "CONFLICT",
                "STALE_DATA",
                "STAFFING_LIMIT_REACHED",
                "RATE_LIMIT_EXCEEDED",
              ],
            },
            details: { type: "object" },
          },
        },
        ValidationErrorResponse: {
          type: "object",
          required: ["success", "message", "code", "errors"],
          properties: {
            success: { type: "boolean", const: false },
            message: { type: "string", examples: ["Validation failed"] },
            code: { type: "string", const: "VALIDATION_ERROR" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    // Petunjuk untuk halaman dokumentasi di frontend: method yang boleh
    // dicoba dan header yang wajib dikirim saat mencoba
    "x-environment": options.environment,
    "x-try-it-out-methods": production
      ? ["get"]
      : ["get", "post", "put", "patch", "delete"],
    "x-try-it-out-header": TRY_IT_OUT_HEADER,
  };
}
