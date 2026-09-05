import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createServer, type Server } from "node:http";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(() => Promise.resolve(null)),
}));

jest.unstable_mockModule("../../src/models/notification.js", () => ({
  countUnread: jest.fn(() => Promise.resolve(0)),
}));

const userModel = await import("../../src/models/user.js");
const notificationModel = await import("../../src/models/notification.js");
const { attachSocketServer } = await import(
  "../../src/realtime/socketServer.js"
);
const { connectionCount, isConnected, resetHub } = await import(
  "../../src/realtime/hub.js"
);
const { createToken } = await import("../../src/helpers/jwt.js");
const { WebSocket } = await import("ws");

const USER_ID = "11111111-1111-4111-8111-111111111111";

let server: Server;
let port: number;
let wss: ReturnType<typeof attachSocketServer>;
const sockets: InstanceType<typeof WebSocket>[] = [];

function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(socket);

  return socket;
}

function opened(socket: InstanceType<typeof WebSocket>) {
  return new Promise<void>((done) => socket.once("open", () => done()));
}

function nextMessage(socket: InstanceType<typeof WebSocket>) {
  return new Promise<Record<string, unknown>>((done) =>
    socket.once("message", (raw) => done(JSON.parse(String(raw)))),
  );
}

function closed(socket: InstanceType<typeof WebSocket>) {
  return new Promise<number>((done) => socket.once("close", (code) => done(code)));
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetHub();
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
  (notificationModel.countUnread as jest.Mock).mockResolvedValue(0 as never);

  server = createServer();
  wss = attachSocketServer(server);

  await new Promise<void>((done) => server.listen(0, () => done()));
  port = (server.address() as { port: number }).port;
});

afterEach(async () => {
  for (const socket of sockets) socket.terminate();
  sockets.length = 0;

  wss.close();
  await new Promise<void>((done) => server.close(() => done()));
});

describe("autentikasi soket", () => {
  it("koneksi belum terdaftar sebelum token dikirim", async () => {
    const socket = connect();
    await opened(socket);

    expect(connectionCount()).toBe(0);
  });

  it("mendaftarkan koneksi setelah token yang sah dikirim", async () => {
    const token = createToken({
      id: USER_ID,
      email: "yusuf@awan.io",
      role: "employee",
    });

    const socket = connect();
    await opened(socket);
    socket.send(JSON.stringify({ action: "auth", token }));

    const pesan = await nextMessage(socket);

    expect(pesan.event).toBe("ready");
    expect(isConnected(USER_ID)).toBe(true);
  });

  it("mengirim jumlah belum dibaca saat baru tersambung", async () => {
    (notificationModel.countUnread as jest.Mock).mockResolvedValue(7 as never);

    const token = createToken({
      id: USER_ID,
      email: "yusuf@awan.io",
      role: "employee",
    });

    const socket = connect();
    await opened(socket);
    socket.send(JSON.stringify({ action: "auth", token }));

    expect((await nextMessage(socket)).unread).toBe(7);
  });

  it("menutup koneksi kalau tokennya palsu", async () => {
    const socket = connect();
    await opened(socket);
    socket.send(JSON.stringify({ action: "auth", token: "token-palsu" }));

    expect(await closed(socket)).toBe(4001);
    expect(connectionCount()).toBe(0);
  });

  it("menutup koneksi kalau pesannya bukan permintaan auth", async () => {
    const socket = connect();
    await opened(socket);
    socket.send(JSON.stringify({ action: "halo" }));

    expect(await closed(socket)).toBe(4001);
  });

  it("menutup koneksi kalau pesannya bukan JSON", async () => {
    const socket = connect();
    await opened(socket);
    socket.send("bukan json");

    expect(await closed(socket)).toBe(4001);
  });

  it("menolak token yang diterbitkan sebelum password diganti", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      password_changed_at: new Date(Date.now() + 60_000),
    } as never);

    const token = createToken({
      id: USER_ID,
      email: "yusuf@awan.io",
      role: "employee",
    });

    const socket = connect();
    await opened(socket);
    socket.send(JSON.stringify({ action: "auth", token }));

    expect(await closed(socket)).toBe(4001);
  });

  it("membuang koneksi dari daftar saat ditutup", async () => {
    const token = createToken({
      id: USER_ID,
      email: "yusuf@awan.io",
      role: "employee",
    });

    const socket = connect();
    await opened(socket);
    socket.send(JSON.stringify({ action: "auth", token }));
    await nextMessage(socket);

    expect(connectionCount()).toBe(1);

    socket.close();
    await closed(socket);
    // penutupan diproses pada putaran berikutnya
    await new Promise((done) => setTimeout(done, 50));

    expect(connectionCount()).toBe(0);
  });

  it("mengabaikan pesan lanjutan setelah terautentikasi", async () => {
    const token = createToken({
      id: USER_ID,
      email: "yusuf@awan.io",
      role: "employee",
    });

    const socket = connect();
    await opened(socket);
    socket.send(JSON.stringify({ action: "auth", token }));
    await nextMessage(socket);

    // perintah apa pun sesudahnya tidak boleh menutup atau mengubah apa pun
    socket.send(JSON.stringify({ action: "hapus-semua" }));
    await new Promise((done) => setTimeout(done, 50));

    expect(connectionCount()).toBe(1);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });
});
