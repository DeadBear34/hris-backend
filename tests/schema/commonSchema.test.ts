import { describe, it, expect } from "@jest/globals";
import { idParamSchema } from "../../src/schema/commonSchema.js";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("idParamSchema", () => {
  it("menerima uuid yang valid", () => {
    const result = idParamSchema.safeParse({ id: VALID_UUID });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(VALID_UUID);
    }
  });

  it("menolak id yang bukan uuid", () => {
    const result = idParamSchema.safeParse({ id: "123" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("ID tidak valid");
    }
  });

  it("menolak id kosong", () => {
    const result = idParamSchema.safeParse({ id: "" });

    expect(result.success).toBe(false);
  });

  it("menolak jika id tidak dikirim", () => {
    const result = idParamSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("menolak id berupa angka", () => {
    const result = idParamSchema.safeParse({ id: 1 });

    expect(result.success).toBe(false);
  });

  it("menolak uuid dengan versi yang tidak dikenal", () => {
    const result = idParamSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
    });

    expect(result.success).toBe(false);
  });

  it("membuang parameter selain id", () => {
    const result = idParamSchema.safeParse({ id: VALID_UUID, role: "admin" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("role");
    }
  });
});
