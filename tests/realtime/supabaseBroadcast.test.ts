import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { logger } = await import("../../src/config/logger.js");
const { publish } = await import("../../src/realtime/supabaseBroadcast.js");
const { env } = await import("../../src/config/env.js");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const settle = () => new Promise((done) => setTimeout(done, 10));

type Ubah = {
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
};

let asli: Ubah;
let fetchMock: jest.Mock;

function bodyOf(call = 0) {
  const [, init] = fetchMock.mock.calls[call] as [string, { body: string }];

  return JSON.parse(init.body) as {
    messages: {
      topic: string;
      event: string;
      payload: unknown;
      private: boolean;
    }[];
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  const e = env as Ubah;
  asli = {
    SUPABASE_JWT_SECRET: e.SUPABASE_JWT_SECRET,
    SUPABASE_ANON_KEY: e.SUPABASE_ANON_KEY,
    SUPABASE_URL: e.SUPABASE_URL,
  };
  e.SUPABASE_JWT_SECRET = "rahasia-uji-yang-panjangnya-lebih-dari-32-karakter";
  e.SUPABASE_ANON_KEY = "sb_publishable_uji";

  fetchMock = jest.fn(() =>
    Promise.resolve({ ok: true, status: 202 }),
  ) as unknown as jest.Mock;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  Object.assign(env as Ubah, asli);
});

describe("penerbitan ke kanal privat Supabase", () => {
  it("menandai pesannya privat supaya kebijakan RLS berlaku", async () => {
    publish([USER_A], "notification.created", { data: { id: "n1" } });
    await settle();

    expect(bodyOf().messages[0]!.private).toBe(true);
  });

  it("memakai nama kanal yang cocok dengan kebijakan RLS", async () => {
    publish([USER_A], "notification.created", {});
    await settle();

    expect(bodyOf().messages[0]!.topic).toBe(`notif:${USER_A}`);
  });

  it("mengirim isi lengkap, bukan isyarat kosong", async () => {
    const data = { id: "n1", title: "Pengajuan cuti baru" };

    publish([USER_A], "notification.created", { data });
    await settle();

    expect(bodyOf().messages[0]!.payload).toEqual({ data });
  });

  it("menggabungkan banyak penerima dalam satu permintaan", async () => {
    publish([USER_A, USER_B], "notification.cleared", { ids: ["n1"] });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf().messages).toHaveLength(2);
  });

  it("penerima kembar hanya dikirimi sekali", async () => {
    publish([USER_A, USER_A], "notification.created", {});
    await settle();

    expect(bodyOf().messages).toHaveLength(1);
  });

  it("tidak memanggil apa pun untuk daftar kosong", async () => {
    publish([], "notification.created", {});
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("diam saja kalau Realtime belum diaktifkan", async () => {
    (env as Ubah).SUPABASE_JWT_SECRET = undefined;

    publish([USER_A], "notification.created", {});
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tidak melempar walau Supabase menolak", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as never);

    expect(() => publish([USER_A], "notification.created", {})).not.toThrow();
    await settle();

    expect(logger.error).toHaveBeenCalled();
  });

  it("tidak melempar walau jaringan gagal", async () => {
    fetchMock.mockRejectedValue(new Error("jaringan mati") as never);

    expect(() => publish([USER_A], "notification.created", {})).not.toThrow();
    await settle();

    expect(logger.error).toHaveBeenCalled();
  });
});
