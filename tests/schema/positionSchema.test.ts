import { describe, it, expect } from "@jest/globals";
import {
  createPositionSchema,
  updatePositionSchema,
} from "../../src/schema/positionSchema.js";

const validPosition = {
  code: "SWE",
  name: "Software Engineer",
};

describe("createPositionSchema", () => {
  it("menerima data yang valid", () => {
    const result = createPositionSchema.safeParse(validPosition);

    expect(result.success).toBe(true);
  });

  it("menerima data tanpa level", () => {
    const result = createPositionSchema.safeParse(validPosition);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBeUndefined();
    }
  });

  it("mengubah kode menjadi huruf besar", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      code: "swe",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("SWE");
    }
  });

  it("membuang spasi di awal dan akhir nama", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      name: "  Software Engineer  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Software Engineer");
    }
  });

  it("mengubah level dari string menjadi angka", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      level: "3",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBe(3);
      expect(typeof result.data.level).toBe("number");
    }
  });

  it("menerima level terendah", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      level: 1,
    });

    expect(result.success).toBe(true);
  });

  it("menerima level tertinggi", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      level: 10,
    });

    expect(result.success).toBe(true);
  });

  it("menolak level di bawah 1", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      level: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("minimal 1");
    }
  });

  it("menolak level di atas 10", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      level: 11,
    });

    expect(result.success).toBe(false);
  });

  it("menolak level berupa pecahan", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      level: 1.5,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("bilangan bulat");
    }
  });

  it("menolak level yang bukan angka", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      level: "senior",
    });

    expect(result.success).toBe(false);
  });

  it("menolak kode kurang dari 2 karakter", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      code: "S",
    });

    expect(result.success).toBe(false);
  });

  it("menolak nama kurang dari 3 karakter", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      name: "SE",
    });

    expect(result.success).toBe(false);
  });

  it("menolak body kosong", () => {
    const result = createPositionSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));

      expect(fields).toContain("code");
      expect(fields).toContain("name");
    }
  });

  it("tidak menerima is_active saat pembuatan", () => {
    const result = createPositionSchema.safeParse({
      ...validPosition,
      is_active: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("is_active");
    }
  });
});

describe("updatePositionSchema", () => {
  it("menerima objek kosong karena semua field opsional", () => {
    const result = updatePositionSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("menerima perubahan level saja", () => {
    const result = updatePositionSchema.safeParse({ level: 5 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBe(5);
      expect(result.data).not.toHaveProperty("code");
    }
  });

  it("menerima is_active", () => {
    const result = updatePositionSchema.safeParse({ is_active: false });

    expect(result.success).toBe(true);
  });

  it("menolak is_active yang bukan boolean", () => {
    const result = updatePositionSchema.safeParse({ is_active: 0 });

    expect(result.success).toBe(false);
  });

  it("tetap menerapkan batas level saat dikirim", () => {
    const result = updatePositionSchema.safeParse({ level: 99 });

    expect(result.success).toBe(false);
  });
});
