import { describe, it, expect } from "@jest/globals";
import { logger, logLevel } from "../../src/config/logger.js";
import { env } from "../../src/config/env.js";

describe("logger", () => {
  // Jest menyetel NODE_ENV=test, dan LOG_LEVEL dari .env tidak boleh membuat
  // hasil pengujian dibanjiri log
  it("senyap selama pengujian apa pun isi LOG_LEVEL", () => {
    expect(env.NODE_ENV).toBe("test");
    expect(logLevel).toBe("silent");
    expect(logger.level).toBe("silent");
  });

  it("menyediakan seluruh level pencatatan yang dipakai aplikasi", () => {
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("dapat mencatat objek error tanpa melempar kesalahan", () => {
    expect(() => logger.error(new Error("percobaan"))).not.toThrow();
  });
});
