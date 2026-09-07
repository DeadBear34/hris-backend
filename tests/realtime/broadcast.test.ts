import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { logger } = await import("../../src/config/logger.js");
const { signalUsers } = await import("../../src/realtime/broadcast.js");
const { channelFor } = await import("../../src/helpers/notificationChannel.js");
const { env } = await import("../../src/config/env.js");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const settle = () => new Promise((done) => setTimeout(done, 10));

let fetchMock: jest.Mock;

function bodyOf(call: number) {
  const [, init] = fetchMock.mock.calls[call] as [string, { body: string }];

  return JSON.parse(init.body) as {
    messages: { topic: string; event: string; payload: unknown }[];
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn(() =>
    Promise.resolve({ ok: true, status: 202 }),
  ) as unknown as jest.Mock;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("siaran isyarat notifikasi", () => {
  it("mengirim ke kanal hasil turunan, bukan ke user_id", async () => {
    signalUsers([USER_A]);
    await settle();

    const { messages } = bodyOf(0);

    expect(messages[0]!.topic).toBe(channelFor(USER_A));
    expect(messages[0]!.topic).not.toContain(USER_A);
  });

  it("tidak pernah mengirim isi notifikasi", async () => {
    signalUsers([USER_A]);
    await settle();

    const { messages } = bodyOf(0);

    expect(messages[0]!.event).toBe("refresh");
    expect(messages[0]!.payload).toEqual({});
  });

  it("menggabungkan banyak penerima dalam satu permintaan", async () => {
    signalUsers([USER_A, USER_B]);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).messages).toHaveLength(2);
  });

  it("penerima kembar hanya disiarkan sekali", async () => {
    signalUsers([USER_A, USER_A, USER_A]);
    await settle();

    expect(bodyOf(0).messages).toHaveLength(1);
  });

  it("tidak memanggil apa pun untuk daftar kosong", async () => {
    signalUsers([]);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("memakai service role key pada header", async () => {
    signalUsers([USER_A]);
    await settle();

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];

    expect(url).toContain("/realtime/v1/api/broadcast");
    expect(init.headers.apikey).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
  });

  it("tidak melempar walau Supabase menolak", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as never);

    expect(() => signalUsers([USER_A])).not.toThrow();
    await settle();

    expect(logger.error).toHaveBeenCalled();
  });

  it("tidak melempar walau jaringan gagal", async () => {
    fetchMock.mockRejectedValue(new Error("jaringan mati") as never);

    expect(() => signalUsers([USER_A])).not.toThrow();
    await settle();

    expect(logger.error).toHaveBeenCalled();
  });

  it("tidak menyiarkan apa pun kalau rahasianya tidak diatur", async () => {
    const asli = env.NOTIFY_CHANNEL_SECRET;
    (env as { NOTIFY_CHANNEL_SECRET?: string }).NOTIFY_CHANNEL_SECRET =
      undefined;

    signalUsers([USER_A]);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();

    (env as { NOTIFY_CHANNEL_SECRET?: string }).NOTIFY_CHANNEL_SECRET = asli;
  });
});
