import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { WebSocket } from "ws";

const { register, unregister, pushTo, pushToMany, connectionCount, isConnected, resetHub } =
  await import("../../src/realtime/hub.js");

const OPEN = 1;
const CLOSING = 2;

function fakeSocket(readyState = OPEN) {
  return { readyState, send: jest.fn() } as unknown as WebSocket & {
    send: jest.Mock;
  };
}

beforeEach(() => {
  resetHub();
});

describe("pendaftaran koneksi", () => {
  it("menyimpan beberapa soket untuk satu pengguna", () => {
    register("u1", fakeSocket());
    register("u1", fakeSocket());

    expect(connectionCount()).toBe(2);
    expect(isConnected("u1")).toBe(true);
  });

  it("membuang soket saat koneksinya ditutup", () => {
    const socket = fakeSocket();

    register("u1", socket);
    unregister(socket);

    expect(connectionCount()).toBe(0);
    expect(isConnected("u1")).toBe(false);
  });

  it("tidak menyisakan kunci kosong setelah soket terakhir pergi", () => {
    const a = fakeSocket();
    const b = fakeSocket();

    register("u1", a);
    register("u1", b);
    unregister(a);

    expect(isConnected("u1")).toBe(true);

    unregister(b);

    expect(isConnected("u1")).toBe(false);
  });

  it("mengabaikan soket yang tidak pernah terdaftar", () => {
    expect(() => unregister(fakeSocket())).not.toThrow();
  });
});

describe("pengiriman pesan", () => {
  it("mengirim ke semua tab milik pengguna", () => {
    const a = fakeSocket();
    const b = fakeSocket();

    register("u1", a);
    register("u1", b);

    const delivered = pushTo("u1", { event: "ready", unread: 3 });

    expect(delivered).toBe(2);
    expect(a.send).toHaveBeenCalled();
    expect(b.send).toHaveBeenCalled();
  });

  it("tidak mengirim ke pengguna lain", () => {
    const milikOrangLain = fakeSocket();

    register("u1", fakeSocket());
    register("u2", milikOrangLain);

    pushTo("u1", { event: "ready", unread: 1 });

    expect(milikOrangLain.send).not.toHaveBeenCalled();
  });

  it("melewati soket yang sedang menutup", () => {
    const menutup = fakeSocket(CLOSING);

    register("u1", menutup);

    expect(pushTo("u1", { event: "ready", unread: 0 })).toBe(0);
    expect(menutup.send).not.toHaveBeenCalled();
  });

  it("aman dipanggil untuk pengguna yang sedang tidak tersambung", () => {
    expect(pushTo("hantu", { event: "ready", unread: 0 })).toBe(0);
  });

  it("tidak melempar walau pengiriman gagal", () => {
    const rusak = fakeSocket();
    rusak.send.mockImplementation(() => {
      throw new Error("soket rusak");
    });

    register("u1", rusak);

    expect(() => pushTo("u1", { event: "ready", unread: 0 })).not.toThrow();
  });

  it("mengirim pesan sebagai JSON", () => {
    const socket = fakeSocket();

    register("u1", socket);
    pushTo("u1", { event: "notification.cleared", ids: ["n1"] });

    const [payload] = socket.send.mock.calls[0] as [string];

    expect(JSON.parse(payload)).toEqual({
      event: "notification.cleared",
      ids: ["n1"],
    });
  });
});

describe("pengiriman ke banyak penerima", () => {
  it("mengirim ke setiap penerima", () => {
    const a = fakeSocket();
    const b = fakeSocket();

    register("u1", a);
    register("u2", b);

    expect(pushToMany(["u1", "u2"], { event: "ready", unread: 0 })).toBe(2);
  });

  it("penerima kembar hanya dikirimi sekali", () => {
    const socket = fakeSocket();

    register("u1", socket);

    expect(pushToMany(["u1", "u1", "u1"], { event: "ready", unread: 0 })).toBe(
      1,
    );
    expect(socket.send).toHaveBeenCalledTimes(1);
  });
});
