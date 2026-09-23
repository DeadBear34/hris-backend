import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule("../../src/models/notification.js", () => ({
  deleteReadOlderThan: jest.fn(),
}));

const { logger } = await import("../../src/config/logger.js");
const notificationModel = await import("../../src/models/notification.js");
const { runCleanup, NOTIFICATION_RETENTION_DAYS } =
  await import("../../src/helpers/notificationCleanup.js");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("pembersihan notifikasi lama", () => {
  it("memakai batas umur yang masuk akal", () => {
    expect(NOTIFICATION_RETENTION_DAYS).toBeGreaterThanOrEqual(7);
    expect(NOTIFICATION_RETENTION_DAYS).toBeLessThanOrEqual(90);
  });

  it("menghapus memakai batas umur itu", async () => {
    (notificationModel.deleteReadOlderThan as jest.Mock).mockResolvedValue(
      3 as never,
    );

    await runCleanup();

    expect(notificationModel.deleteReadOlderThan).toHaveBeenCalledWith(
      NOTIFICATION_RETENTION_DAYS,
    );
  });

  it("mencatat berapa yang terhapus", async () => {
    (notificationModel.deleteReadOlderThan as jest.Mock).mockResolvedValue(
      5 as never,
    );

    expect(await runCleanup()).toBe(5);
    expect(logger.info).toHaveBeenCalled();
  });

  it("tidak mencatat apa-apa kalau tidak ada yang terhapus", async () => {
    (notificationModel.deleteReadOlderThan as jest.Mock).mockResolvedValue(
      0 as never,
    );

    await runCleanup();

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("tidak melempar walau penghapusan gagal", async () => {
    (notificationModel.deleteReadOlderThan as jest.Mock).mockRejectedValue(
      new Error("database mati") as never,
    );

    await expect(runCleanup()).resolves.toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
