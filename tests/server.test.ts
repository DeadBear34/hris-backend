import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";

const mockClose = jest.fn((finish: () => void) => finish());

// WebSocketServer memasang listener di http.Server, jadi tiruannya harus
// punya on/once/removeListener supaya menyerupai server sungguhan
const mockListen = jest.fn(() => ({
  close: mockClose,
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
  removeListener: jest.fn(),
  emit: jest.fn(),
  address: () => ({ port: 0 }),
}));
const mockTestConnection = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.unstable_mockModule("../src/app.js", () => ({
  app: { listen: mockListen },
}));

jest.unstable_mockModule("../src/config/databaseConnection.js", () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  testConnection: mockTestConnection,
}));

// Pendengar antar-instance membuka koneksi database sendiri, jadi dimatikan
// di sini supaya pengujian tidak menyentuh database sungguhan
jest.unstable_mockModule("../src/realtime/crossInstance.js", () => ({
  startCrossInstance: jest.fn(() => Promise.resolve()),
  stopCrossInstance: jest.fn(() => Promise.resolve()),
  announce: jest.fn(),
  instanceId: () => "uji",
}));

jest.unstable_mockModule("../src/config/logger.js", () => ({
  logger: { info: mockLoggerInfo, error: mockLoggerError, warn: jest.fn() },
}));

const { env } = await import("../src/config/env.js");

let exitCodes: number[] = [];

// server.ts memanggil start() saat diimpor tanpa mengekspor promise-nya
async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise((finish) => setTimeout(finish, 5));
  }

  throw new Error("server tidak selesai dijalankan tepat waktu");
}

async function bootServer() {
  jest.resetModules();
  await import("../src/server.js");
}

beforeEach(() => {
  jest.clearAllMocks();
  exitCodes = [];

  jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCodes.push(code ?? 0);
    return undefined as never;
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
  process.removeAllListeners("SIGINT");
});

describe("server berhasil dijalankan", () => {
  beforeEach(() => {
    mockTestConnection.mockResolvedValue({ now: new Date() } as never);
  });

  it("memeriksa koneksi database sebelum melayani request", async () => {
    await bootServer();
    await waitFor(() => mockListen.mock.calls.length > 0);

    expect(mockTestConnection).toHaveBeenCalled();
  });

  it("mendengarkan pada port dari environment", async () => {
    await bootServer();
    await waitFor(() => mockListen.mock.calls.length > 0);

    const [port] = mockListen.mock.calls[0] as unknown as [number];

    expect(port).toBe(env.PORT);
  });

  it("mencatat bahwa database sudah terhubung", async () => {
    await bootServer();
    await waitFor(() => mockListen.mock.calls.length > 0);

    expect(mockLoggerInfo).toHaveBeenCalledWith("Database connected");
  });

  it("mencatat alamat server saat sudah siap", async () => {
    await bootServer();
    await waitFor(() => mockListen.mock.calls.length > 0);

    const [, ready] = mockListen.mock.calls[0] as unknown as [
      number,
      () => void,
    ];
    ready();

    const message = mockLoggerInfo.mock.calls.map(([p]) => String(p));

    expect(message.some((p) => p.includes(String(env.PORT)))).toBe(true);
  });

  it("tidak menghentikan proses saat database sehat", async () => {
    await bootServer();
    await waitFor(() => mockListen.mock.calls.length > 0);

    expect(exitCodes).toEqual([]);
  });

  it("memasang penanganan SIGINT untuk mematikan server dengan rapi", async () => {
    await bootServer();
    await waitFor(() => mockListen.mock.calls.length > 0);

    const handler = process.listeners("SIGINT").at(-1) as () => void;
    handler();

    expect(mockClose).toHaveBeenCalled();
    expect(exitCodes).toEqual([0]);
  });
});

describe("server gagal terhubung ke database", () => {
  beforeEach(() => {
    mockTestConnection.mockRejectedValue(
      new Error("connection refused") as never,
    );
  });

  it("menghentikan proses dengan kode kegagalan", async () => {
    await bootServer();
    await waitFor(() => exitCodes.length > 0);

    expect(exitCodes).toContain(1);
  });

  it("mencatat penyebab kegagalan", async () => {
    await bootServer();
    await waitFor(() => exitCodes.length > 0);

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.any(Error),
      "Failed to connect to the database",
    );
  });

  it("tidak mengumumkan database terhubung", async () => {
    await bootServer();
    await waitFor(() => exitCodes.length > 0);

    expect(mockLoggerInfo).not.toHaveBeenCalledWith("Database connected");
  });
});
