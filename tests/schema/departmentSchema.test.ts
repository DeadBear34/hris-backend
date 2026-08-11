import { describe, it, expect } from "@jest/globals";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "../../src/schema/departmentSchema.js";

const validDepartment = {
  code: "IT",
  name: "Teknologi Informasi",
};

describe("createDepartmentSchema", () => {
  it("menerima data yang valid", () => {
    const result = createDepartmentSchema.safeParse(validDepartment);

    expect(result.success).toBe(true);
  });

  it("mengubah kode menjadi huruf besar", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      code: "it",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("IT");
    }
  });

  it("membuang spasi di awal dan akhir kode", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      code: "  it  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("IT");
    }
  });

  it("membuang spasi di awal dan akhir nama", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      name: "  Teknologi Informasi  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Teknologi Informasi");
    }
  });

  it("menolak kode kurang dari 2 karakter", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      code: "I",
    });

    expect(result.success).toBe(false);
  });

  it("menolak kode melebihi 20 karakter", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      code: "A".repeat(21),
    });

    expect(result.success).toBe(false);
  });

  it("menolak kode yang hanya berisi spasi", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      code: "     ",
    });

    expect(result.success).toBe(false);
  });

  it("menolak nama kurang dari 3 karakter", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      name: "IT",
    });

    expect(result.success).toBe(false);
  });

  it("menolak nama melebihi 100 karakter", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      name: "a".repeat(101),
    });

    expect(result.success).toBe(false);
  });

  it("menolak body kosong", () => {
    const result = createDepartmentSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));

      expect(fields).toContain("code");
      expect(fields).toContain("name");
    }
  });

  it("tidak menerima is_active saat pembuatan", () => {
    const result = createDepartmentSchema.safeParse({
      ...validDepartment,
      is_active: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("is_active");
    }
  });
});

describe("updateDepartmentSchema", () => {
  it("menerima objek kosong karena semua field opsional", () => {
    const result = updateDepartmentSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("menerima perubahan nama saja", () => {
    const result = updateDepartmentSchema.safeParse({ name: "Keuangan" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("code");
    }
  });

  it("menerima is_active", () => {
    const result = updateDepartmentSchema.safeParse({ is_active: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(false);
    }
  });

  it("menolak is_active yang bukan boolean", () => {
    const result = updateDepartmentSchema.safeParse({ is_active: "false" });

    expect(result.success).toBe(false);
  });

  it("tetap menerapkan aturan panjang saat field dikirim", () => {
    const result = updateDepartmentSchema.safeParse({ code: "I" });

    expect(result.success).toBe(false);
  });

  it("tetap mengubah kode menjadi huruf besar", () => {
    const result = updateDepartmentSchema.safeParse({ code: "hrd" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("HRD");
    }
  });
});
