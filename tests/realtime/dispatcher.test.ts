import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { logger } = await import("../../src/config/logger.js");
const { registerTransport, dispatch, resetTransports, transportNames } =
  await import("../../src/realtime/dispatcher.js");

const EVENT = { event: "notification.cleared", ids: ["n1"] } as const;

function jalur(name: string) {
  const send = jest.fn();

  return { transport: { name, send }, send };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetTransports();
});

describe("pendaftaran jalur", () => {
  it("mencatat jalur yang didaftarkan", () => {
    registerTransport(jalur("a").transport);
    registerTransport(jalur("b").transport);

    expect(transportNames()).toEqual(["a", "b"]);
  });
});

describe("penyaluran pesan", () => {
  it("mengirim ke semua jalur yang terdaftar", () => {
    const a = jalur("a");
    const b = jalur("b");

    registerTransport(a.transport);
    registerTransport(b.transport);
    dispatch(["u1"], EVENT);

    expect(a.send).toHaveBeenCalledWith(["u1"], EVENT);
    expect(b.send).toHaveBeenCalledWith(["u1"], EVENT);
  });

  it("membuang penerima kembar sebelum menyalurkan", () => {
    const a = jalur("a");

    registerTransport(a.transport);
    dispatch(["u1", "u1", "u2"], EVENT);

    expect(a.send).toHaveBeenCalledWith(["u1", "u2"], EVENT);
  });

  it("tidak memanggil jalur mana pun untuk daftar kosong", () => {
    const a = jalur("a");

    registerTransport(a.transport);
    dispatch([], EVENT);

    expect(a.send).not.toHaveBeenCalled();
  });

  it("satu jalur gagal tidak menghentikan jalur lain", () => {
    const rusak = jalur("rusak");
    const sehat = jalur("sehat");

    rusak.send.mockImplementation(() => {
      throw new Error("jalur mati");
    });

    registerTransport(rusak.transport);
    registerTransport(sehat.transport);
    dispatch(["u1"], EVENT);

    expect(sehat.send).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("aman dipanggil walau belum ada jalur terdaftar", () => {
    expect(() => dispatch(["u1"], EVENT)).not.toThrow();
  });
});
