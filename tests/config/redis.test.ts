import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { EventEmitter } from "node:events";

// Klien Redis tiruan: mencatat opsi yang dipakai, dan statusnya bisa diatur
// sendiri untuk meniru tersambung, terputus, atau sedang menyambung
class FakeRedis extends EventEmitter {
  static instances: FakeRedis[] = [];

  status = "connecting";
  quit = jest.fn(() => Promise.resolve("OK"));
  disconnect = jest.fn();

  constructor(
    public url: string,
    public options: Record<string, unknown>,
  ) {
    super();
    FakeRedis.instances.push(this);
  }
}

jest.unstable_mockModule("ioredis", () => ({ Redis: FakeRedis }));

const mockInfo = jest.fn();
const mockWarn = jest.fn();

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { debug: jest.fn(), info: mockInfo, warn: mockWarn, error: jest.fn() },
}));

const { startRedis, getRedis, redisState, closeRedis } =
  await import("../../src/config/redis.js");

const URL = "redis://127.0.0.1:6379";

function lastClient(): FakeRedis {
  return FakeRedis.instances.at(-1)!;
}

beforeEach(async () => {
  // Setiap test mulai dari keadaan belum tersambung
  await closeRedis();
  FakeRedis.instances = [];
  jest.clearAllMocks();
});

describe("startRedis", () => {
  it("tidak membuat koneksi bila REDIS_URL kosong", () => {
    expect(startRedis(undefined)).toBeNull();
    expect(FakeRedis.instances).toHaveLength(0);
    expect(redisState()).toBe("disabled");
  });

  it("mencatat bahwa fitur Redis dimatikan", () => {
    startRedis(undefined);

    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining("REDIS_URL is not set"),
    );
  });

  it("menyambung ke alamat yang diberikan", () => {
    startRedis(URL);

    expect(lastClient().url).toBe(URL);
  });

  it("perintah gagal cepat dan tidak ditumpuk selama terputus", () => {
    startRedis(URL);

    expect(lastClient().options).toMatchObject({
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
    });
  });

  it("terus mencoba menyambung dengan jeda yang makin panjang, paling lama 10 detik", () => {
    startRedis(URL);

    const retry = lastClient().options.retryStrategy as (n: number) => number;

    expect(retry(1)).toBe(500);
    expect(retry(4)).toBe(2_000);
    expect(retry(100)).toBe(10_000);
  });

  it("tidak membuat koneksi kedua bila dipanggil lagi", () => {
    const first = startRedis(URL);
    const second = startRedis(URL);

    expect(second).toBe(first);
    expect(FakeRedis.instances).toHaveLength(1);
  });
});

describe("ketahanan terhadap Redis yang mati", () => {
  it("galat koneksi tidak dilempar sebagai galat tak tertangani", () => {
    startRedis(URL);

    expect(() =>
      lastClient().emit("error", new Error("connect ECONNREFUSED")),
    ).not.toThrow();
  });

  it("peringatan hanya dicatat sekali per putusnya koneksi", () => {
    startRedis(URL);
    const client = lastClient();

    client.emit("error", new Error("ECONNREFUSED"));
    client.emit("error", new Error("ECONNREFUSED"));
    client.emit("error", new Error("ECONNREFUSED"));

    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it("peringatan dicatat lagi bila koneksi putus setelah sempat pulih", () => {
    startRedis(URL);
    const client = lastClient();

    client.emit("error", new Error("putus pertama"));
    client.emit("ready");
    client.emit("error", new Error("putus kedua"));

    expect(mockWarn).toHaveBeenCalledTimes(2);
  });
});

describe("getRedis dan redisState", () => {
  it("getRedis hanya mengembalikan klien yang benar-benar siap", () => {
    startRedis(URL);
    const client = lastClient();

    client.status = "connecting";
    expect(getRedis()).toBeNull();

    client.status = "ready";
    expect(getRedis()).toBe(client);

    client.status = "reconnecting";
    expect(getRedis()).toBeNull();
  });

  it("menerjemahkan status koneksi menjadi keadaan yang mudah dibaca", () => {
    startRedis(URL);
    const client = lastClient();

    client.status = "connecting";
    expect(redisState()).toBe("connecting");

    client.status = "ready";
    expect(redisState()).toBe("ready");

    client.status = "reconnecting";
    expect(redisState()).toBe("unavailable");

    client.status = "end";
    expect(redisState()).toBe("unavailable");
  });
});

describe("closeRedis", () => {
  it("menutup koneksi dengan rapi", async () => {
    startRedis(URL);
    const client = lastClient();

    await closeRedis();

    expect(client.quit).toHaveBeenCalled();
    expect(redisState()).toBe("disabled");
  });

  it("memutus paksa bila Redis sudah tidak menjawab", async () => {
    startRedis(URL);
    const client = lastClient();
    client.quit.mockRejectedValue(new Error("Stream isn't writeable") as never);

    await closeRedis();

    expect(client.disconnect).toHaveBeenCalled();
  });

  it("aman dipanggil walau Redis tidak pernah dinyalakan", async () => {
    await expect(closeRedis()).resolves.toBeUndefined();
  });
});
