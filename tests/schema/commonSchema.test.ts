import { describe, it, expect } from "@jest/globals";
import { idParamSchema, personName } from "../../src/schema/commonSchema.js";

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
      expect(result.error.issues[0]?.message).toBe("Invalid ID");
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

describe("personName", () => {
  const schema = personName("Full name");
  const accept = (value: string) => schema.safeParse(value).success;

  it("menerima nama biasa", () => {
    expect(accept("Ismail Muhammad")).toBe(true);
  });

  it("menerima tanda yang lazim pada nama: titik gelar, apostrof, tanda hubung", () => {
    expect(accept("Dr. Siti Aisyah")).toBe(true);
    expect(accept("Muhammad Al-Fatih")).toBe(true);
    expect(accept("Ni Luh D'Arcy")).toBe(true);
  });

  it("menerima huruf beraksen", () => {
    expect(accept("José Ramírez")).toBe(true);
  });

  it("menolak karakter khusus seperti temuan QA", () => {
    expect(accept("@&^#&^3")).toBe(false);
    expect(accept("Budi#Santoso")).toBe(false);
  });

  it("menolak masukan berbentuk skrip", () => {
    expect(accept("<script>alert('xss')</script>Zahrah")).toBe(false);
  });

  it("menolak angka di dalam nama", () => {
    expect(accept("Karyawan 123")).toBe(false);
  });

  it("harus diawali huruf, bukan tanda baca", () => {
    expect(accept("-Budi")).toBe(false);
    expect(accept(".Budi")).toBe(false);
  });

  it("membuang spasi di tepi sebelum diperiksa", () => {
    const result = schema.safeParse("  Siti Aisyah  ");

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Siti Aisyah");
  });

  it("tetap menerapkan batas panjang", () => {
    expect(accept("Al")).toBe(false);
    expect(accept("A".repeat(151))).toBe(false);
  });
});
