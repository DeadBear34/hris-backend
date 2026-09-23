import { describe, it, expect } from "@jest/globals";
import {
  listEmployeeQuerySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  updateOwnProfileSchema,
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
      expect(result.error.issues[0]?.message).toBe("Invalid department");
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

describe("updateOwnProfileSchema", () => {
  it("menerima keempat field yang diizinkan", () => {
    const result = updateOwnProfileSchema.safeParse({
      full_name: "Ismail Muhammad",
      phone: "+628123456789",
      birth_date: "1998-05-20",
      address: "Jalan Merdeka 10",
    });

    expect(result.success).toBe(true);
  });

  it("menerima objek kosong karena seluruh field opsional", () => {
    expect(updateOwnProfileSchema.safeParse({}).success).toBe(true);
  });

  it("membuang manager_id sehingga penyetuju cuti tidak dapat diubah sendiri", () => {
    const result = updateOwnProfileSchema.safeParse({
      full_name: "Ismail Muhammad",
      manager_id: MANAGER_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("manager_id");
    }
  });

  it("membuang departemen dan jabatan", () => {
    const result = updateOwnProfileSchema.safeParse({
      department_id: DEPARTMENT_ID,
      position_id: POSITION_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("department_id");
      expect(result.data).not.toHaveProperty("position_id");
    }
  });

  it("membuang gender, status kepegawaian, dan tanggal bergabung", () => {
    const result = updateOwnProfileSchema.safeParse({
      gender: "female",
      employment_status: "permanent",
      join_date: "2020-01-01",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("gender");
      expect(result.data).not.toHaveProperty("employment_status");
      expect(result.data).not.toHaveProperty("join_date");
    }
  });

  it("membuang email, password, dan role", () => {
    const result = updateOwnProfileSchema.safeParse({
      email: "penyerang@awan.io",
      password: "password123",
      role: "admin",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("email");
      expect(result.data).not.toHaveProperty("password");
      expect(result.data).not.toHaveProperty("role");
    }
  });

  it("membuang is_active sehingga karyawan tidak dapat menonaktifkan dirinya", () => {
    const result = updateOwnProfileSchema.safeParse({ is_active: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("is_active");
    }
  });

  it("tetap menerapkan aturan nomor telepon", () => {
    expect(
      updateOwnProfileSchema.safeParse({ phone: "08123456789" }).success,
    ).toBe(false);
  });

  it("tetap menerapkan aturan panjang nama", () => {
    expect(updateOwnProfileSchema.safeParse({ full_name: "Is" }).success).toBe(
      false,
    );
  });

  it("tetap menerapkan format tanggal lahir", () => {
    expect(
      updateOwnProfileSchema.safeParse({ birth_date: "20-05-1998" }).success,
    ).toBe(false);
  });

  it("tetap menerapkan batas panjang alamat", () => {
    expect(
      updateOwnProfileSchema.safeParse({ address: "a".repeat(501) }).success,
    ).toBe(false);
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

describe("mengosongkan kolom lewat update", () => {
  it("menerima null untuk melepas manajer, departemen, dan jabatan", () => {
    const result = updateEmployeeSchema.safeParse({
      manager_id: null,
      department_id: null,
      position_id: null,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      manager_id: null,
      department_id: null,
      position_id: null,
    });
  });

  it("menerima null untuk alamat dan tanggal resign", () => {
    const result = updateEmployeeSchema.safeParse({
      address: null,
      resign_date: null,
    });

    expect(result.success).toBe(true);
  });

  it("kolom yang tidak dikirim tidak ikut dikosongkan", () => {
    const result = updateEmployeeSchema.safeParse({ full_name: "Nama Baru" });

    expect(result.data?.manager_id).toBeUndefined();
  });

  it("null tidak berlaku untuk kolom wajib seperti nama", () => {
    const result = updateEmployeeSchema.safeParse({ full_name: null });

    expect(result.success).toBe(false);
  });
});

describe("kolom opsional yang dikirim kosong", () => {
  const base = {
    email: "ujang@awan.io",
    password: "12345678",
    full_name: "Ujang Sutisna",
    phone: "+628110000001",
    gender: "male",
  };

  it("sel CSV kosong diperlakukan sebagai tidak diisi, bukan ditolak", () => {
    const result = createEmployeeSchema.safeParse({
      ...base,
      birth_date: "",
      address: "",
      department_id: "",
      position_id: "",
      manager_id: "",
      employment_status: "",
      join_date: "",
      role: "",
    });

    expect(result.success).toBe(true);
  });

  it("kolom kosong menjadi undefined, bukan string kosong", () => {
    const result = createEmployeeSchema.parse({
      ...base,
      address: "",
      birth_date: "",
    });

    expect(result.address).toBeUndefined();
    expect(result.birth_date).toBeUndefined();
  });

  it("alamat berisi spasi saja dianggap kosong", () => {
    const result = createEmployeeSchema.parse({ ...base, address: "   " });

    expect(result.address).toBeUndefined();
  });

  it("kolom yang benar-benar diisi tetap tersimpan", () => {
    const result = createEmployeeSchema.parse({
      ...base,
      address: "Jl. Merdeka No. 10",
      birth_date: "1998-05-20",
    });

    expect(result.address).toBe("Jl. Merdeka No. 10");
    expect(result.birth_date).toBe("1998-05-20");
  });
});

describe("kewajaran tanggal", () => {
  const base = {
    email: "ujang@awan.io",
    password: "12345678",
    full_name: "Ujang Sutisna",
    phone: "+628110000001",
    gender: "male",
  };

  function rejectionMessage(data: Record<string, unknown>): string {
    const result = createEmployeeSchema.safeParse({ ...base, ...data });

    expect(result.success).toBe(false);

    return result.success ? "" : result.error.issues[0]!.message;
  }

  it("menolak tanggal lahir di masa depan", () => {
    expect(rejectionMessage({ birth_date: "2090-01-01" })).toContain(
      "at least",
    );
  });

  it("menolak karyawan di bawah usia kerja", () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    expect(
      rejectionMessage({ birth_date: fiveYearsAgo.toISOString().slice(0, 10) }),
    ).toContain("at least 15 years");
  });

  it("menolak tanggal lahir yang terlalu jauh ke belakang", () => {
    expect(rejectionMessage({ birth_date: "1850-01-01" })).toContain("too far");
  });

  it("menerima usia kerja yang wajar", () => {
    const twentyFive = new Date();
    twentyFive.setFullYear(twentyFive.getFullYear() - 25);

    const result = createEmployeeSchema.safeParse({
      ...base,
      birth_date: twentyFive.toISOString().slice(0, 10),
    });

    expect(result.success).toBe(true);
  });

  it("menolak tanggal bergabung yang terlalu jauh ke depan", () => {
    expect(rejectionMessage({ join_date: "2200-01-01" })).toContain("365 days");
  });

  it("menerima tanggal bergabung yang belum tiba tetapi masih wajar", () => {
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const result = createEmployeeSchema.safeParse({
      ...base,
      join_date: nextMonth.toISOString().slice(0, 10),
    });

    expect(result.success).toBe(true);
  });

  it("menolak bergabung sebelum tanggal lahir", () => {
    expect(
      rejectionMessage({ birth_date: "2000-01-01", join_date: "1990-01-01" }),
    ).toContain("before birth date");
  });

  it("aturan tanggal juga berlaku saat mengubah karyawan", () => {
    const result = updateEmployeeSchema.safeParse({
      birth_date: "2000-01-01",
      join_date: "1990-01-01",
    });

    expect(result.success).toBe(false);
  });
});

describe("usia dihitung secara kalender", () => {
  const base = {
    email: "batas@awan.io",
    password: "12345678",
    full_name: "Uji Batas",
    phone: "+628110000001",
    gender: "male",
  };

  function dateForAge(years: number, dayOffset = 0): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() + dayOffset);

    return d.toISOString().slice(0, 10);
  }

  function accepted(birth_date: string): boolean {
    return createEmployeeSchema.safeParse({ ...base, birth_date }).success;
  }

  it("menerima yang tepat berulang tahun ke-15 hari ini", () => {
    expect(accepted(dateForAge(15))).toBe(true);
  });

  it("menolak yang baru berusia 15 besok", () => {
    expect(accepted(dateForAge(15, 1))).toBe(false);
  });

  it("menerima yang tepat berusia 100 tahun", () => {
    // pembagian selisih milidetik sempat menolak kasus ini karena Date.now()
    // membawa jam saat ini sedangkan tanggal lahir dihitung dari tengah malam
    expect(accepted(dateForAge(100))).toBe(true);
  });

  it("menolak yang sudah lewat 101 tahun", () => {
    expect(accepted(dateForAge(101, -1))).toBe(false);
  });

  it("hasilnya tidak bergantung pada jam saat pengujian dijalankan", () => {
    // usia kalender hanya melihat bagian tanggal, bukan jam
    expect(accepted(dateForAge(30))).toBe(true);
    expect(accepted(dateForAge(16))).toBe(true);
  });
});
