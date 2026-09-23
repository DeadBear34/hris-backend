import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import type { Request, Response, NextFunction } from "express";

const { rateLimit, MemoryRateLimitStore, clientKey, loginKey } =
  await import("../../src/middlewares/rateLimit.js");
const { AppError } = await import("../../src/helpers/appError.js");
const { createToken } = await import("../../src/helpers/jwt.js");

type AppErrorType = InstanceType<typeof AppError>;

const MINUTE = 60 * 1000;
const START = 1_700_000_000_000;

function makeReq(overrides: Partial<Request> = {}): Request {
  return { ip: "10.0.0.1", headers: {}, body: {}, ...overrides } as Request;
}

function makeRes() {
  const headers: Record<string, unknown> = {};
  const res = {
    locals: {},
    setHeader: jest.fn((name: string, value: unknown) => {
      headers[name] = value;
    }),
  } as unknown as Response;

  return { res, headers };
}

function run(
  middleware: ReturnType<typeof rateLimit>,
  req: Request = makeReq(),
  res = makeRes(),
) {
  const next = jest.fn() as unknown as NextFunction;
  middleware(req, res.res, next);

  const [err] = ((next as jest.Mock).mock.calls[0] ?? []) as [
    AppErrorType | undefined,
  ];

  return { err, headers: res.headers };
}

let now = START;

beforeEach(() => {
  now = START;
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function limiter(limit: number, extra: Record<string, unknown> = {}) {
  return rateLimit({
    name: "uji",
    limit,
    windowMs: MINUTE,
    store: new MemoryRateLimitStore(),
    enabled: true,
    ...extra,
  });
}

describe("rateLimit", () => {
  it("meloloskan permintaan selama masih di bawah batas", () => {
    const guard = limiter(3);

    for (let i = 0; i < 3; i++) {
      expect(run(guard).err).toBeUndefined();
    }
  });

  it("menolak permintaan setelah batas terlampaui dengan 429 RATE_LIMIT_EXCEEDED", () => {
    const guard = limiter(2);

    run(guard);
    run(guard);
    const { err } = run(guard);

    expect(err).toBeInstanceOf(AppError);
    expect(err?.statusCode).toBe(429);
    expect(err?.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(err?.message).toBe("Too many requests");
  });

  it("mengirim X-RateLimit-Limit dan sisa jatah yang berkurang tiap permintaan", () => {
    const guard = limiter(3);

    expect(run(guard).headers).toMatchObject({
      "X-RateLimit-Limit": 3,
      "X-RateLimit-Remaining": 2,
    });
    expect(run(guard).headers["X-RateLimit-Remaining"]).toBe(1);
    expect(run(guard).headers["X-RateLimit-Remaining"]).toBe(0);
  });

  it("sisa jatah tidak pernah negatif walau terus ditolak", () => {
    const guard = limiter(1);

    run(guard);
    run(guard);

    expect(run(guard).headers["X-RateLimit-Remaining"]).toBe(0);
  });

  it("Retry-After berisi detik tersisa sampai jendela berakhir", () => {
    const guard = limiter(1);

    run(guard);
    now = START + 30_500;

    const { headers } = run(guard);

    expect(headers["Retry-After"]).toBe(30);
  });

  it("Retry-After minimal 1 detik di ujung jendela", () => {
    const guard = limiter(1);

    run(guard);
    now = START + MINUTE - 1;

    expect(run(guard).headers["Retry-After"]).toBe(1);
  });

  it("tidak mengirim Retry-After selama permintaan masih lolos", () => {
    const guard = limiter(5);

    expect(run(guard).headers).not.toHaveProperty("Retry-After");
  });

  it("jatah kembali penuh setelah jendela berakhir", () => {
    const guard = limiter(1);

    run(guard);
    expect(run(guard).err?.code).toBe("RATE_LIMIT_EXCEEDED");

    now = START + MINUTE;
    const { err, headers } = run(guard);

    expect(err).toBeUndefined();
    expect(headers["X-RateLimit-Remaining"]).toBe(0);
  });

  it("menghitung tiap klien secara terpisah", () => {
    const guard = limiter(1);

    run(guard, makeReq({ ip: "10.0.0.1" }));

    expect(run(guard, makeReq({ ip: "10.0.0.2" })).err).toBeUndefined();
    expect(run(guard, makeReq({ ip: "10.0.0.1" })).err?.statusCode).toBe(429);
  });

  it("pembatas dengan nama berbeda tidak saling memakan jatah", () => {
    const store = new MemoryRateLimitStore();
    const first = limiter(1, { name: "pertama", store });
    const second = limiter(1, { name: "kedua", store });

    run(first);

    expect(run(second).err).toBeUndefined();
  });

  it("tidak melakukan apa pun saat dimatikan", () => {
    const guard = limiter(1, { enabled: false });

    run(guard);
    const { err, headers } = run(guard);

    expect(err).toBeUndefined();
    expect(headers).toEqual({});
  });

  it("header memakai pembatas yang sisanya paling sedikit", () => {
    const store = new MemoryRateLimitStore();
    const strict = limiter(5, { name: "ketat", store });
    const loose = limiter(100, { name: "longgar", store });
    const res = makeRes();

    run(strict, makeReq(), res);
    run(loose, makeReq(), res);

    expect(res.headers).toMatchObject({
      "X-RateLimit-Limit": 5,
      "X-RateLimit-Remaining": 4,
    });
  });
});

describe("MemoryRateLimitStore", () => {
  it("membuang jendela yang sudah kedaluwarsa agar memori tidak terus tumbuh", () => {
    const store = new MemoryRateLimitStore();

    store.hit("a", MINUTE, START);
    store.hit("b", MINUTE, START);
    expect(store.size).toBe(2);

    store.hit("c", MINUTE, START + MINUTE);

    expect(store.size).toBe(1);
  });
});

describe("clientKey", () => {
  it("memakai id pengguna dari token yang sah", () => {
    const token = createToken({
      id: "11111111-1111-4111-8111-111111111111",
      email: "ismail@awan.io",
      role: "employee",
    });

    const key = clientKey(
      makeReq({ headers: { authorization: `Bearer ${token}` } }),
    );

    expect(key).toBe("user:11111111-1111-4111-8111-111111111111");
  });

  it("dua pengguna di balik IP kantor yang sama punya jatah sendiri-sendiri", () => {
    const tokenOf = (id: string) =>
      createToken({ id, email: `${id}@awan.io`, role: "employee" });

    const first = clientKey(
      makeReq({ headers: { authorization: `Bearer ${tokenOf("a")}` } }),
    );
    const second = clientKey(
      makeReq({ headers: { authorization: `Bearer ${tokenOf("b")}` } }),
    );

    expect(first).not.toBe(second);
  });

  it("jatuh ke IP bila token palsu, sehingga id pengguna tidak bisa diakali", () => {
    const key = clientKey(
      makeReq({ headers: { authorization: "Bearer bukan.token.sah" } }),
    );

    expect(key).toBe("ip:10.0.0.1");
  });

  it("memakai IP bila tidak ada token", () => {
    expect(clientKey(makeReq())).toBe("ip:10.0.0.1");
  });
});

describe("loginKey", () => {
  it("menggabungkan IP dan email", () => {
    const key = loginKey(makeReq({ body: { email: "ismail@awan.io" } }));

    expect(key).toBe("ip:10.0.0.1:email:ismail@awan.io");
  });

  it("menyamakan huruf besar dan spasi supaya variasi penulisan tidak menambah jatah", () => {
    const plain = loginKey(makeReq({ body: { email: "ismail@awan.io" } }));
    const varied = loginKey(makeReq({ body: { email: "  Ismail@Awan.IO " } }));

    expect(varied).toBe(plain);
  });

  it("tetap menghasilkan kunci walau body tidak berisi email", () => {
    expect(loginKey(makeReq({ body: undefined }))).toBe("ip:10.0.0.1:email:");
  });
});
