import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { logger } = await import("../../src/config/logger.js");
const { announce, instanceId } =
  await import("../../src/realtime/crossInstance.js");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const settle = () => new Promise((done) => setTimeout(done, 10));

let query: jest.Mock;
const db = () => ({ query }) as unknown as Parameters<typeof announce>[2];

function payloadOf(call = 0) {
  const [, params] = query.mock.calls[call] as [string, [string, string]];

  return JSON.parse(params[1]) as {
    from: string;
    user_ids: string[];
    message: unknown;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  query = jest.fn(() => Promise.resolve({ rows: [] })) as unknown as jest.Mock;
});

describe("pengumuman antar-instance", () => {
  it("memakai pg_notify pada kanal bersama", async () => {
    announce([USER_A], { event: "notification.created" }, db());
    await settle();

    const [sql, params] = query.mock.calls[0] as [string, [string, string]];

    expect(sql).toContain("pg_notify");
    expect(params[0]).toBe("hris_notifications");
  });

  it("menyertakan penanda instance pengirim", async () => {
    announce([USER_A], { event: "notification.created" }, db());
    await settle();

    expect(payloadOf().from).toBe(instanceId());
  });

  it("membawa daftar penerima dan pesannya", async () => {
    const message = { event: "notification.cleared", ids: ["n1", "n2"] };

    announce([USER_A, USER_B], message, db());
    await settle();

    const payload = payloadOf();

    expect(payload.user_ids).toEqual([USER_A, USER_B]);
    expect(payload.message).toEqual(message);
  });

  it("tidak mengumumkan apa pun untuk daftar penerima kosong", async () => {
    announce([], { event: "notification.created" }, db());
    await settle();

    expect(query).not.toHaveBeenCalled();
  });

  it("melewati pengumuman yang melebihi batas payload pg_notify", async () => {
    const besar = { event: "notification.created", data: "x".repeat(8000) };

    announce([USER_A], besar, db());
    await settle();

    expect(query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("tidak melempar walau pengumumannya gagal", async () => {
    query.mockRejectedValue(new Error("database mati") as never);

    expect(() =>
      announce([USER_A], { event: "notification.created" }, db()),
    ).not.toThrow();

    await settle();

    expect(logger.error).toHaveBeenCalled();
  });

  it("penanda instance tetap sama sepanjang proses hidup", () => {
    expect(instanceId()).toBe(instanceId());
  });
});
