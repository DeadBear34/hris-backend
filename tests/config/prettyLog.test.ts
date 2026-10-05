import { describe, it, expect, afterEach } from "@jest/globals";
import {
  formatLogLine,
  formatTimestamp,
  shouldUseColor,
} from "../../src/config/prettyLog.js";

const ZONE = "Asia/Jakarta";

// 2026-10-04 23:37:46 WIB
const AT = Date.UTC(2026, 9, 4, 16, 37, 46);

const ESC = "\x1b[";

describe("formatTimestamp", () => {
  it("menampilkan tanggal dan jam lengkap menurut zona kantor", () => {
    expect(formatTimestamp(AT, ZONE)).toBe("2026-10-04 23:37:46");
  });

  it("tengah malam ditulis 00, bukan 24", () => {
    expect(formatTimestamp(Date.UTC(2026, 9, 4, 17, 0, 0), ZONE)).toBe(
      "2026-10-05 00:00:00",
    );
  });
});

describe("formatLogLine tanpa warna", () => {
  const line = (level: number, msg: string, extra: object = {}) =>
    formatLogLine({ level, time: AT, msg, ...extra }, ZONE, false);

  it("menulis waktu, label tingkat, lalu pesan dalam satu baris", () => {
    expect(line(30, "Server running")).toBe(
      "[2026-10-04 23:37:46] [INFO]    Server running\n",
    );
  });

  it("memakai label yang mudah dibaca untuk setiap tingkat", () => {
    expect(line(20, "x")).toContain("[DEBUG]");
    expect(line(30, "x")).toContain("[INFO]");
    expect(line(40, "x")).toContain("[WARNING]");
    expect(line(50, "x")).toContain("[ERROR]");
  });

  it("pesan selalu mulai di kolom yang sama apa pun labelnya", () => {
    const column = (text: string) => text.indexOf("pesan");

    expect(column(line(30, "pesan"))).toBe(column(line(40, "pesan")));
    expect(column(line(20, "pesan"))).toBe(column(line(50, "pesan")));
  });

  it("menyembunyikan pid, hostname, dan isi log aktivitas", () => {
    const text = line(20, "Employee updated", {
      pid: 1234,
      hostname: "laptop",
      activity: { action: "employee.update" },
    });

    expect(text).not.toContain("1234");
    expect(text).not.toContain("laptop");
    expect(text).not.toContain("employee.update");
  });

  it("menampilkan field tambahan yang ringkas di belakang pesan", () => {
    expect(line(40, "Redis unavailable", { reason: "ECONNREFUSED" })).toContain(
      '{"reason":"ECONNREFUSED"}',
    );
  });

  it("menampilkan stack error di baris berikutnya", () => {
    const text = line(50, "Request failed", {
      err: { type: "Error", message: "boom", stack: "Error: boom\n    at x" },
    });

    expect(text.split("\n")[1]).toContain("Error: boom");
  });
});

describe("formatLogLine dengan warna", () => {
  it("hanya label tingkat yang berwarna, pesannya tidak", () => {
    const text = formatLogLine(
      { level: 50, time: AT, msg: "Gagal" },
      ZONE,
      true,
    );

    expect(text).toContain(`${ESC}31m[ERROR]${ESC}0m`);
    expect(text).toMatch(/\[ERROR\]\x1b\[0m +Gagal\n$/);
  });

  it("warna berbeda untuk setiap tingkat", () => {
    const colorOf = (level: number) =>
      formatLogLine({ level, time: AT, msg: "x" }, ZONE, true).match(
        /\x1b\[[\d;]+m(?=\[[A-Z]+\])/,
      )?.[0];

    const colors = new Set([20, 30, 40, 50].map(colorOf));

    expect(colors.size).toBe(4);
  });
});

describe("shouldUseColor", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("mematikan warna bila NO_COLOR diisi", () => {
    process.env.NO_COLOR = "1";
    process.env.FORCE_COLOR = "1";

    expect(shouldUseColor()).toBe(false);
  });

  it("menyalakan warna bila FORCE_COLOR diisi", () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";

    expect(shouldUseColor()).toBe(true);
  });
});
