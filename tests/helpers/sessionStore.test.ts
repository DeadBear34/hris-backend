import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Redis tiruan berbasis Map. ttl disimpan supaya lama penyimpanannya bisa diperiksa
const store = new Map<string, { value: string; ttl: number }>();

const fakeRedis = {
  get: jest.fn(async (key: string) => store.get(key)?.value ?? null),
  set: jest.fn(async (key: string, value: string, _ex: string, ttl: number) => {
    store.set(key, { value, ttl });
    return "OK";
  }),
  del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
};

let redisReady = true;

jest.unstable_mockModule("../../src/config/redis.js", () => ({
  getRedis: () => (redisReady ? fakeRedis : null),
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(),
}));

const userModel = await import("../../src/models/user.js");
const {
  loadSession,
  forgetSession,
  revokeToken,
  isTokenRevoked,
  sessionRejection,
  resetRevokedTokens,
  SESSION_CACHE_SECONDS,
} = await import("../../src/helpers/sessionStore.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CHANGED_AT = new Date("2026-10-01T00:00:00.000Z");

const activeSession = {
  id: USER_ID,
  password_changed_at: CHANGED_AT,
  is_active: true,
};

function tokenPayload(override: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);

  return {
    id: USER_ID,
    email: "ismail@awan.io",
    role: "employee",
    jti: "jti-1",
    iat: now,
    exp: now + 3600,
    ...override,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  redisReady = true;
  resetRevokedTokens();
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue(
    activeSession as never,
  );
});

describe("loadSession", () => {
  it("membaca database lalu menyimpan hasilnya di Redis", async () => {
    const session = await loadSession(USER_ID);

    expect(session).toEqual(activeSession);
    expect(userModel.findSessionInfo).toHaveBeenCalledTimes(1);
    expect(store.get(`session:${USER_ID}`)?.ttl).toBe(SESSION_CACHE_SECONDS);
  });

  it("permintaan berikutnya tidak lagi menyentuh database", async () => {
    await loadSession(USER_ID);
    const second = await loadSession(USER_ID);

    expect(userModel.findSessionInfo).toHaveBeenCalledTimes(1);
    // tanggal dari cache dikembalikan sebagai Date, bukan string
    expect(second?.password_changed_at).toBeInstanceOf(Date);
    expect(second?.password_changed_at?.getTime()).toBe(CHANGED_AT.getTime());
  });

  it("akun yang sudah dihapus juga disimpan supaya tidak memicu query terus", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);

    expect(await loadSession(USER_ID)).toBeNull();
    expect(await loadSession(USER_ID)).toBeNull();
    expect(userModel.findSessionInfo).toHaveBeenCalledTimes(1);
  });

  it("tanpa Redis langsung membaca database setiap kali", async () => {
    redisReady = false;

    await loadSession(USER_ID);
    await loadSession(USER_ID);

    expect(userModel.findSessionInfo).toHaveBeenCalledTimes(2);
  });

  it("Redis yang gagal tidak menggagalkan request", async () => {
    fakeRedis.get.mockRejectedValueOnce(new Error("koneksi putus") as never);
    fakeRedis.set.mockRejectedValueOnce(new Error("koneksi putus") as never);

    expect(await loadSession(USER_ID)).toEqual(activeSession);
  });
});

describe("forgetSession", () => {
  it("perubahan berikutnya langsung terbaca dari database", async () => {
    await loadSession(USER_ID);

    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      ...activeSession,
      is_active: false,
    } as never);
    await forgetSession(USER_ID);

    expect((await loadSession(USER_ID))?.is_active).toBe(false);
  });

  it("aman dipanggil saat Redis mati", async () => {
    redisReady = false;

    await expect(forgetSession(USER_ID)).resolves.toBeUndefined();
  });
});

describe("revokeToken dan isTokenRevoked", () => {
  it("disimpan di Redis sampai token kedaluwarsa", async () => {
    const payload = tokenPayload();

    expect(await revokeToken(payload)).toBe(true);

    const entry = store.get("revoked:jti-1");
    expect(entry).toBeDefined();
    expect(entry!.ttl).toBeGreaterThan(3590);
    expect(entry!.ttl).toBeLessThanOrEqual(3600);
    expect(await isTokenRevoked(payload)).toBe(true);
  });

  it("tetap ditolak oleh proses ini walau Redis mati saat logout", async () => {
    redisReady = false;
    const payload = tokenPayload();

    await revokeToken(payload);

    expect(await isTokenRevoked(payload)).toBe(true);
  });

  it("dikenali dari Redis walau dicabut oleh instance lain", async () => {
    store.set("revoked:jti-1", { value: "1", ttl: 3600 });

    expect(await isTokenRevoked(tokenPayload())).toBe(true);
  });

  it("token tanpa jti tidak dapat dicabut satu per satu", async () => {
    const legacy = tokenPayload({ jti: undefined });

    expect(await revokeToken(legacy)).toBe(false);
    expect(await isTokenRevoked(legacy)).toBe(false);
  });

  it("token lain tidak ikut tercabut", async () => {
    await revokeToken(tokenPayload());

    expect(await isTokenRevoked(tokenPayload({ jti: "jti-2" }))).toBe(false);
  });
});

describe("sessionRejection", () => {
  it("null untuk sesi yang sah", async () => {
    expect(await sessionRejection(tokenPayload())).toBeNull();
  });

  it("menolak token yang sudah logout", async () => {
    await revokeToken(tokenPayload());

    expect(await sessionRejection(tokenPayload())).toContain("logged out");
  });

  it("menolak akun yang sudah dihapus", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);

    expect(await sessionRejection(tokenPayload())).toContain(
      "no longer exists",
    );
  });

  it("menolak akun yang dinonaktifkan", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      ...activeSession,
      is_active: false,
    } as never);

    expect(await sessionRejection(tokenPayload())).toContain("deactivated");
  });

  it("menolak token yang terbit sebelum password diganti", async () => {
    const iat = Math.floor(CHANGED_AT.getTime() / 1000) - 10;

    expect(await sessionRejection(tokenPayload({ iat }))).toContain(
      "password was changed",
    );
  });
});
