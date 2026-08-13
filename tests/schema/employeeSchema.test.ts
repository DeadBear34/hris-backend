import { describe, it, expect } from "@jest/globals";
import {
  listEmployeeQuerySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
} from "../../src/schema/employeeSchema.js";

const DEPARTMENT_ID = "33333333-3333-4333-8333-333333333333";
const POSITION_ID = "44444444-4444-4444-8444-444444444444";
const MANAGER_ID = "55555555-5555-4555-8555-555555555555";

const validCreate = {
  email: "ismail@awan.io",
  password: "password123",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
};

describe("listEmployeeQuerySchema", () => {
  it("menerima query kosong", () => {
    const result = listEmployeeQuerySchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("memberi halaman dan batas bawaan", () => {
    const result = listEmployeeQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
    }
  });

  it("mengubah page dan limit dari string menjadi angka", () => {
    const result = listEmployeeQuerySchema.safeParse({
      page: "2",
      limit: "25",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
    }
  });

  it("mengubah is_active true menjadi boolean", () => {
    const result = listEmployeeQuerySchema.safeParse({ is_active: "true" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("mengubah is_active false menjadi boolean", () => {
    const result = listEmployeeQuerySchema.safeParse({ is_active: "false" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(false);
    }
  });

  it("membiarkan is_active undefined jika tidak dikirim", () => {
    const result = listEmployeeQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBeUndefined();
    }
  });

  it("menolak is_active di luar true dan false", () => {
    const result = listEmployeeQuerySchema.safeParse({ is_active: "1" });

    expect(result.success).toBe(false);
  });

  it("membuang spasi pada kata kunci pencarian", () => {
    const result = listEmployeeQuerySchema.safeParse({ search: "  ismail  " });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("ismail");
    }
  });

  it("menerima department_id berupa uuid", () => {
    const result = listEmployeeQuerySchema.safeParse({
      department_id: DEPARTMENT_ID,
    });

    expect(result.success).toBe(true);
  });

  it("menolak department_id yang bukan uuid", () => {
    const result = listEmployeeQuerySchema.safeParse({ department_id: "1" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Department tidak valid");
    }
  });

  it("menolak halaman nol", () => {
    const result = listEmployeeQuerySchema.safeParse({ page: "0" });

    expect(result.success).toBe(false);
  });

  it("menolak halaman negatif", () => {
    const result = listEmployeeQuerySchema.safeParse({ page: "-1" });

    expect(result.success).toBe(false);
  });

  it("menolak halaman berupa pecahan", () => {
    const result = listEmployeeQuerySchema.safeParse({ page: "1.5" });

    expect(result.success).toBe(false);
  });

  it("menolak halaman yang bukan angka", () => {
    const result = listEmployeeQuerySchema.safeParse({ page: "dua" });

    expect(result.success).toBe(false);
  });

  it("menerima batas maksimum 100", () => {
    const result = listEmployeeQuerySchema.safeParse({ limit: "100" });

    expect(result.success).toBe(true);
  });

  it("menolak batas melebihi 100 agar tidak membebani database", () => {
    const result = listEmployeeQuerySchema.safeParse({ limit: "1000" });

    expect(result.success).toBe(false);
  });

  it("membuang parameter yang tidak dikenal", () => {
    const result = listEmployeeQuerySchema.safeParse({ order_by: "salary" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("order_by");
    }
  });
});

describe("createEmployeeSchema", () => {
  it("menerima data minimum yang valid", () => {
    const result = createEmployeeSchema.safeParse(validCreate);

    expect(result.success).toBe(true);
  });

  it("menerima data lengkap", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      role: "admin",
      birth_date: "1998-05-20",
      address: "Jalan Merdeka 10",
      department_id: DEPARTMENT_ID,
      position_id: POSITION_ID,
      manager_id: MANAGER_ID,
      employment_status: "permanent",
      join_date: "2024-01-01",
    });

    expect(result.success).toBe(true);
  });

  it("mengubah email menjadi huruf kecil", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      email: "Ismail@Awan.IO",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ismail@awan.io");
    }
  });

  it("menolak email tanpa tanda @", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      email: "bukanemail",
    });

    expect(result.success).toBe(false);
  });

  it("menolak password kurang dari 8 karakter", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      password: "1234567",
    });

    expect(result.success).toBe(false);
  });

  it("menolak password melebihi 72 karakter", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      password: "a".repeat(73),
    });

    expect(result.success).toBe(false);
  });

  it("menolak nomor telepon tanpa kode negara", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      phone: "08123456789",
    });

    expect(result.success).toBe(false);
  });

  it("menolak gender di luar pilihan", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      gender: "lainnya",
    });

    expect(result.success).toBe(false);
  });

  it("menerima seluruh pilihan role", () => {
    for (const role of ["employee", "admin"]) {
      const result = createEmployeeSchema.safeParse({ ...validCreate, role });

      expect(result.success).toBe(true);
    }
  });

  it("menolak role di luar pilihan", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      role: "superadmin",
    });

    expect(result.success).toBe(false);
  });

  it("menerima seluruh pilihan status kepegawaian", () => {
    const statuses = [
      "probation",
      "contract",
      "permanent",
      "intern",
      "resigned",
    ];

    for (const employment_status of statuses) {
      const result = createEmployeeSchema.safeParse({
        ...validCreate,
        employment_status,
      });

      expect(result.success).toBe(true);
    }
  });

  it("menolak status kepegawaian di luar pilihan", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      employment_status: "magang",
    });

    expect(result.success).toBe(false);
  });

  it("menolak tanggal lahir dengan format selain YYYY-MM-DD", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      birth_date: "20-05-1998",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("birth_date");
    }
  });

  it("menolak tanggal lahir yang tidak ada di kalender", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      birth_date: "1998-02-31",
    });

    expect(result.success).toBe(false);
  });

  it("menolak tanggal bergabung dengan format salah", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      join_date: "01/01/2024",
    });

    expect(result.success).toBe(false);
  });

  it("menolak department_id yang bukan uuid", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      department_id: "1",
    });

    expect(result.success).toBe(false);
  });

  it("menolak position_id yang bukan uuid", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      position_id: "1",
    });

    expect(result.success).toBe(false);
  });

  it("menolak manager_id yang bukan uuid", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      manager_id: "1",
    });

    expect(result.success).toBe(false);
  });

  it("menolak alamat melebihi 500 karakter", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      address: "a".repeat(501),
    });

    expect(result.success).toBe(false);
  });

  it("membuang field yang tidak ada di skema", () => {
    const result = createEmployeeSchema.safeParse({
      ...validCreate,
      is_active: false,
      employee_number: "999",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("is_active");
      expect(result.data).not.toHaveProperty("employee_number");
    }
  });

  it("melaporkan seluruh field wajib yang belum diisi", () => {
    const result = createEmployeeSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));

      expect(fields).toContain("email");
      expect(fields).toContain("password");
      expect(fields).toContain("full_name");
      expect(fields).toContain("phone");
      expect(fields).toContain("gender");
    }
  });
});

describe("updateEmployeeSchema", () => {
  it("menerima objek kosong karena semua field opsional", () => {
    const result = updateEmployeeSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("menerima perubahan sebagian field", () => {
    const result = updateEmployeeSchema.safeParse({
      full_name: "Ismail Muhammad",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("phone");
    }
  });

  it("menerima is_active dan resign_date", () => {
    const result = updateEmployeeSchema.safeParse({
      is_active: false,
      resign_date: "2026-01-31",
    });

    expect(result.success).toBe(true);
  });

  it("menolak resign_date dengan format salah", () => {
    const result = updateEmployeeSchema.safeParse({
      resign_date: "31-01-2026",
    });

    expect(result.success).toBe(false);
  });

  it("menolak is_active yang bukan boolean", () => {
    const result = updateEmployeeSchema.safeParse({ is_active: "false" });

    expect(result.success).toBe(false);
  });

  it("tidak mengizinkan penggantian email lewat pembaruan", () => {
    const result = updateEmployeeSchema.safeParse({ email: "baru@awan.io" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("email");
    }
  });

  it("tidak mengizinkan penggantian password lewat pembaruan", () => {
    const result = updateEmployeeSchema.safeParse({ password: "password123" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("password");
    }
  });

  it("tidak mengizinkan penggantian role lewat pembaruan", () => {
    const result = updateEmployeeSchema.safeParse({ role: "admin" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("role");
    }
  });

  it("tetap menerapkan aturan nomor telepon saat dikirim", () => {
    const result = updateEmployeeSchema.safeParse({ phone: "08123456789" });

    expect(result.success).toBe(false);
  });

  it("tetap menerapkan aturan panjang nama saat dikirim", () => {
    const result = updateEmployeeSchema.safeParse({ full_name: "Is" });

    expect(result.success).toBe(false);
  });
});
