import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockSend = jest.fn();
const catatKunci = jest.fn();
const mockLoggerInfo = jest.fn();

class FakeResend {
  emails = { send: mockSend };

  constructor(apiKey: string) {
    catatKunci(apiKey);
  }
}

jest.unstable_mockModule("resend", () => ({ Resend: FakeResend }));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: mockLoggerInfo, error: jest.fn(), warn: jest.fn() },
}));

const env = {
  NODE_ENV: "development",
  MAIL_FROM: "HRIS Awanio <no-reply@awan.io>",
  MAIL_DRIVER: undefined as "log" | "resend" | undefined,
  RESEND_API_KEY: undefined as string | undefined,
};

jest.unstable_mockModule("../../src/config/env.js", () => ({ env }));

const surat = {
  to: "ismail@awan.io",
  subject: "Kode verifikasi HRIS: 123456",
  html: "<p>123456</p>",
};

async function muatMailer() {
  jest.resetModules();
  return import("../../src/helpers/mailer.js");
}

beforeEach(() => {
  jest.clearAllMocks();
  env.NODE_ENV = "development";
  env.MAIL_DRIVER = undefined;
  env.RESEND_API_KEY = undefined;
  mockSend.mockResolvedValue({ data: { id: "surat-1" }, error: null } as never);
});

describe("activeMailDriver", () => {
  it("memakai mode log di development jika tidak diatur", async () => {
    const { activeMailDriver } = await muatMailer();

    expect(activeMailDriver()).toBe("log");
  });

  it("memakai Resend di production jika tidak diatur", async () => {
    env.NODE_ENV = "production";
    const { activeMailDriver } = await muatMailer();

    expect(activeMailDriver()).toBe("resend");
  });

  it("mendahulukan MAIL_DRIVER daripada NODE_ENV", async () => {
    env.MAIL_DRIVER = "resend";
    const { activeMailDriver } = await muatMailer();

    expect(activeMailDriver()).toBe("resend");
  });

  it("dapat mematikan pengiriman di production lewat MAIL_DRIVER", async () => {
    env.NODE_ENV = "production";
    env.MAIL_DRIVER = "log";
    const { activeMailDriver } = await muatMailer();

    expect(activeMailDriver()).toBe("log");
  });

  it("tidak pernah mengirim saat pengujian meski MAIL_DRIVER diisi resend", async () => {
    env.NODE_ENV = "test";
    env.MAIL_DRIVER = "resend";
    const { activeMailDriver } = await muatMailer();

    expect(activeMailDriver()).toBe("log");
  });
});

describe("isSecretLoggingAllowed", () => {
  it("mengizinkan pencetakan rahasia di development", async () => {
    const { isSecretLoggingAllowed } = await muatMailer();

    expect(isSecretLoggingAllowed()).toBe(true);
  });

  it("mengizinkan pencetakan rahasia saat pengujian", async () => {
    env.NODE_ENV = "test";
    const { isSecretLoggingAllowed } = await muatMailer();

    expect(isSecretLoggingAllowed()).toBe(true);
  });

  it("melarang pencetakan rahasia di production", async () => {
    env.NODE_ENV = "production";
    const { isSecretLoggingAllowed } = await muatMailer();

    expect(isSecretLoggingAllowed()).toBe(false);
  });

  it("tidak terpengaruh oleh MAIL_DRIVER", async () => {
    env.NODE_ENV = "production";
    env.MAIL_DRIVER = "log";
    const { isSecretLoggingAllowed } = await muatMailer();

    expect(isSecretLoggingAllowed()).toBe(false);
  });
});

describe("pengiriman sungguhan di development", () => {
  beforeEach(() => {
    env.NODE_ENV = "development";
    env.MAIL_DRIVER = "resend";
    env.RESEND_API_KEY = "re_kunci_rahasia";
  });

  it("mengirim lewat Resend saat MAIL_DRIVER bernilai resend", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("tidak mencetak isi email ke log", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  it("tetap melempar error jika RESEND_API_KEY belum diisi", async () => {
    env.RESEND_API_KEY = undefined;

    const { sendMail } = await muatMailer();

    await expect(sendMail(surat)).rejects.toThrow("RESEND_API_KEY");
  });
});

describe("pengujian tidak pernah mengirim email", () => {
  it("tetap memakai mode log walau kunci dan driver tersedia", async () => {
    env.NODE_ENV = "test";
    env.MAIL_DRIVER = "resend";
    env.RESEND_API_KEY = "re_kunci_rahasia";

    const { sendMail } = await muatMailer();

    await sendMail(surat);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalled();
  });
});

describe("mode pengembangan", () => {
  it("tidak mengirim email lewat Resend", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("mencetak isi email ke log", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    const [data] = mockLoggerInfo.mock.calls[0] as [Record<string, unknown>];

    expect(data.to).toBe(surat.to);
    expect(data.subject).toBe(surat.subject);
    expect(data.html).toBe(surat.html);
  });

  it("tetap berjalan tanpa RESEND_API_KEY", async () => {
    const { sendMail } = await muatMailer();

    await expect(sendMail(surat)).resolves.toBeUndefined();
  });

  it("mode test juga tidak mengirim email", async () => {
    env.NODE_ENV = "test";
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("mode production", () => {
  beforeEach(() => {
    env.NODE_ENV = "production";
    env.RESEND_API_KEY = "re_kunci_rahasia";
  });

  it("mengirim email lewat Resend", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("memakai kunci api dari environment", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    expect(catatKunci).toHaveBeenCalledWith("re_kunci_rahasia");
  });

  it("mengirim dengan pengirim, tujuan, subjek, dan isi yang benar", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    const [kiriman] = mockSend.mock.calls[0] as [Record<string, unknown>];

    expect(kiriman).toEqual({
      from: env.MAIL_FROM,
      to: surat.to,
      subject: surat.subject,
      html: surat.html,
    });
  });

  it("tidak mencetak isi email ke log", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);

    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  it("memakai ulang satu klien Resend untuk beberapa email", async () => {
    const { sendMail } = await muatMailer();

    await sendMail(surat);
    await sendMail(surat);

    expect(catatKunci).toHaveBeenCalledTimes(1);
  });

  it("melempar error jika Resend menolak kiriman", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: "domain belum diverifikasi" },
    } as never);

    const { sendMail } = await muatMailer();

    await expect(sendMail(surat)).rejects.toThrow("domain belum diverifikasi");
  });

  it("melempar error jika RESEND_API_KEY belum diatur", async () => {
    env.RESEND_API_KEY = undefined;

    const { sendMail } = await muatMailer();

    await expect(sendMail(surat)).rejects.toThrow("RESEND_API_KEY");
    expect(mockSend).not.toHaveBeenCalled();
  });
});
