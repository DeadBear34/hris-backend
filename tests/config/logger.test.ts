import { describe, it, expect } from "@jest/globals";
import { logger } from "../../src/config/logger.js";
import { env } from "../../src/config/env.js";

describe("logger", () => {
  it("memakai level dari environment", () => {
    expect(logger.level).toBe(env.LOG_LEVEL);
  });

  it("menyediakan seluruh level pencatatan yang dipakai aplikasi", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("dapat mencatat objek error tanpa melempar kesalahan", () => {
    expect(() => logger.error(new Error("percobaan"))).not.toThrow();
  });
});
