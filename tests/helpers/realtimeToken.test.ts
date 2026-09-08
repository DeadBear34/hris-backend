import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import jwt from "jsonwebtoken";

const { mintRealtimeToken, topicFor, realtimeEnabled } =
  await import("../../src/helpers/realtimeToken.js");
const { env } = await import("../../src/config/env.js");

const USER = "11111111-1111-4111-8111-111111111111";
const RAHASIA = "rahasia-uji-yang-panjangnya-lebih-dari-32-karakter";

type Ubah = {
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
};

let asli: Ubah;

beforeEach(() => {
  const e = env as Ubah;
  asli = {
    SUPABASE_JWT_SECRET: e.SUPABASE_JWT_SECRET,
    SUPABASE_ANON_KEY: e.SUPABASE_ANON_KEY,
    SUPABASE_URL: e.SUPABASE_URL,
  };
  e.SUPABASE_JWT_SECRET = RAHASIA;
  e.SUPABASE_ANON_KEY = "sb_publishable_uji";
  e.SUPABASE_URL = "https://uji.supabase.co";
});

afterEach(() => {
  Object.assign(env as Ubah, asli);
});

describe("nama kanal privat", () => {
  it("cocok dengan bentuk yang dipakai kebijakan RLS", () => {
    expect(topicFor(USER)).toBe(`notif:${USER}`);
  });

  it("berbeda untuk pengguna berbeda", () => {
    expect(topicFor(USER)).not.toBe(topicFor("lain"));
  });
});

describe("token Realtime", () => {
  it("ditandatangani dengan rahasia Supabase, bukan JWT_SECRET aplikasi", () => {
    const token = mintRealtimeToken(USER)!;

    // terverifikasi dengan rahasia Supabase
    expect(() => jwt.verify(token, RAHASIA)).not.toThrow();

    // dan TIDAK terverifikasi dengan rahasia aplikasi
    expect(() => jwt.verify(token, env.JWT_SECRET)).toThrow();
  });

  it("memuat sub berisi user_id agar auth.uid() cocok di kebijakan", () => {
    const isi = jwt.verify(mintRealtimeToken(USER)!, RAHASIA) as {
      sub: string;
    };

    expect(isi.sub).toBe(USER);
  });

  it("memakai peran authenticated yang dikenali Supabase", () => {
    const isi = jwt.verify(mintRealtimeToken(USER)!, RAHASIA) as {
      role: string;
      aud: string;
    };

    expect(isi.role).toBe("authenticated");
    expect(isi.aud).toBe("authenticated");
  });

  it("punya masa berlaku, tidak berlaku selamanya", () => {
    const isi = jwt.verify(mintRealtimeToken(USER)!, RAHASIA) as {
      exp: number;
      iat: number;
    };

    expect(isi.exp).toBeGreaterThan(isi.iat);
    expect(isi.exp - isi.iat).toBe(3600);
  });

  it("tidak membocorkan rahasia apa pun di dalam token", () => {
    const token = mintRealtimeToken(USER)!;

    expect(token).not.toContain(RAHASIA);
    expect(token).not.toContain(env.JWT_SECRET);
  });

  it("mengembalikan null kalau rahasianya belum diatur", () => {
    (env as Ubah).SUPABASE_JWT_SECRET = undefined;

    expect(mintRealtimeToken(USER)).toBeNull();
    expect(realtimeEnabled()).toBe(false);
  });

  it("dianggap aktif hanya kalau ketiga env-nya lengkap", () => {
    expect(realtimeEnabled()).toBe(true);

    (env as Ubah).SUPABASE_ANON_KEY = undefined;
    expect(realtimeEnabled()).toBe(false);
  });
});
