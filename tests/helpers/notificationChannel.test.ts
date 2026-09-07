import { jest, describe, it, expect } from "@jest/globals";

const { channelFor, realtimeEnabled } =
  await import("../../src/helpers/notificationChannel.js");
const { env } = await import("../../src/config/env.js");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("penurunan nama kanal", () => {
  it("menghasilkan nama yang sama untuk pengguna yang sama", () => {
    expect(channelFor(USER_A)).toBe(channelFor(USER_A));
  });

  it("menghasilkan nama berbeda untuk pengguna berbeda", () => {
    expect(channelFor(USER_A)).not.toBe(channelFor(USER_B));
  });

  it("tidak memuat user_id di dalam namanya", () => {
    const channel = channelFor(USER_A)!;

    expect(channel).not.toContain(USER_A);
    // potongan mana pun dari uuid tidak boleh bocor
    expect(channel).not.toContain("11111111");
  });

  it("memakai awalan yang seragam", () => {
    expect(channelFor(USER_A)).toMatch(/^notif-[0-9a-f]{32}$/);
  });

  it("panjangnya cukup untuk tidak dapat ditebak", () => {
    // 32 digit heksadesimal = 128 bit
    expect(channelFor(USER_A)!.replace("notif-", "")).toHaveLength(32);
  });

  it("mengembalikan null kalau rahasianya tidak diatur", async () => {
    const asli = env.NOTIFY_CHANNEL_SECRET;

    (env as { NOTIFY_CHANNEL_SECRET?: string }).NOTIFY_CHANNEL_SECRET =
      undefined;

    expect(channelFor(USER_A)).toBeNull();
    expect(realtimeEnabled()).toBe(false);

    (env as { NOTIFY_CHANNEL_SECRET?: string }).NOTIFY_CHANNEL_SECRET = asli;
  });
});
