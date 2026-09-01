import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const employeeModel = await import("../../src/models/employee.js");

const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const MANAGER_ID = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_ID = "33333333-3333-4333-8333-333333333333";

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  employee_number: "001",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
  birth_date: null,
  address: null,
  department_id: null,
  position_id: null,
  manager_id: null,
  employment_status: "probation",
  join_date: new Date(),
  resign_date: null,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe("insertEmployee", () => {
  const fakeDb = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengirim parameter dalam urutan yang benar", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeEmployee],
    } as never);

    await employeeModel.insertEmployee(
      fakeDb as never,
      USER_ID,
      "Ismail Muhammad",
      "+628123456789",
      "male",
    );

    const [, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(values).toEqual([
      USER_ID,
      "Ismail Muhammad",
      "+628123456789",
      "male",
    ]);
  });

  it("memakai parameterized query, bukan interpolasi", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeEmployee],
    } as never);

    await employeeModel.insertEmployee(
      fakeDb as never,
      USER_ID,
      "Ismail Muhammad",
      "+628123456789",
      "male",
    );

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("$1");
    expect(sql).not.toContain("Ismail Muhammad");
  });

  it("melempar error jika tidak ada baris yang tersimpan", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await expect(
      employeeModel.insertEmployee(
        fakeDb as never,
        USER_ID,
        "Ismail Muhammad",
        "+628123456789",
        "male",
      ),
    ).rejects.toThrow("Gagal menyimpan data karyawan");
  });

  it("dapat dijalankan memakai client transaksi", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeEmployee],
    } as never);

    await employeeModel.insertEmployee(
      fakeDb as never,
      USER_ID,
      "Ismail Muhammad",
      "+628123456789",
      "male",
    );

    expect(fakeDb.query).toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("createEmployee", () => {
  const fakeDb = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeEmployee],
    } as never);
  });

  it("mengirim seluruh kolom dalam urutan yang benar", async () => {
    await employeeModel.createEmployee(fakeDb as never, USER_ID, {
      full_name: "Ismail Muhammad",
      phone: "+628123456789",
      gender: "male",
      birth_date: "1998-05-20",
      address: "Jalan Merdeka 10",
      department_id: DEPARTMENT_ID,
      position_id: null as never,
      manager_id: MANAGER_ID,
      employment_status: "permanent",
      join_date: "2024-01-01",
    });

    const [, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(values).toEqual([
      USER_ID,
      "Ismail Muhammad",
      "+628123456789",
      "male",
      "1998-05-20",
      "Jalan Merdeka 10",
      DEPARTMENT_ID,
      null,
      MANAGER_ID,
      "permanent",
      "2024-01-01",
    ]);
  });

  it("mengubah field opsional yang kosong menjadi null", async () => {
    await employeeModel.createEmployee(fakeDb as never, USER_ID, {
      full_name: "Ismail Muhammad",
      phone: "+628123456789",
      gender: "male",
    });

    const [, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(values.slice(4)).toEqual([null, null, null, null, null, null, null]);
  });

  it("memakai nilai bawaan untuk status dan tanggal bergabung", async () => {
    await employeeModel.createEmployee(fakeDb as never, USER_ID, {
      full_name: "Ismail Muhammad",
      phone: "+628123456789",
      gender: "male",
    });

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("'probation'");
    expect(sql).toContain("current_date");
  });

  it("menerima karyawan tanpa akun pengguna", async () => {
    await employeeModel.createEmployee(fakeDb as never, null, {
      full_name: "Ismail Muhammad",
      phone: "+628123456789",
      gender: "male",
    });

    const [, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(values[0]).toBeNull();
  });

  it("melempar error jika tidak ada baris yang tersimpan", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await expect(
      employeeModel.createEmployee(fakeDb as never, USER_ID, {
        full_name: "Ismail Muhammad",
        phone: "+628123456789",
        gender: "male",
      }),
    ).rejects.toThrow("Gagal menyimpan data karyawan");
  });
});

describe("updateOwnProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakeEmployee] } as never);
  });

  it("memperbarui keempat kolom yang diizinkan", async () => {
    await employeeModel.updateOwnProfile(EMPLOYEE_ID, {
      full_name: "Nama Baru",
      phone: "+628990000001",
      birth_date: "1999-01-15",
      address: "Jalan Baru 5",
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("full_name =");
    expect(sql).toContain("phone =");
    expect(sql).toContain("birth_date =");
    expect(sql).toContain("address =");
  });

  it("mengabaikan manager_id walau diselipkan ke dalam data", async () => {
    await employeeModel.updateOwnProfile(EMPLOYEE_ID, {
      full_name: "Nama Baru",
      manager_id: MANAGER_ID,
    } as never);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("manager_id");
  });

  it("mengabaikan kolom struktur organisasi dan status kepegawaian", async () => {
    await employeeModel.updateOwnProfile(EMPLOYEE_ID, {
      full_name: "Nama Baru",
      department_id: DEPARTMENT_ID,
      position_id: DEPARTMENT_ID,
      employment_status: "permanent",
      is_active: false,
      resign_date: "2030-01-01",
      gender: "female",
    } as never);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("department_id");
    expect(sql).not.toContain("position_id");
    expect(sql).not.toContain("employment_status");
    expect(sql).not.toContain("is_active");
    expect(sql).not.toContain("resign_date");
    expect(sql).not.toContain("gender");
  });

  it("tetap menambahkan cast tanggal untuk birth_date", async () => {
    await employeeModel.updateOwnProfile(EMPLOYEE_ID, {
      birth_date: "1999-01-15",
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("::date");
  });

  it("tidak menyentuh karyawan yang sudah dihapus", async () => {
    await employeeModel.updateOwnProfile(EMPLOYEE_ID, {
      full_name: "Nama Baru",
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });

  it("tidak menjalankan UPDATE jika tidak ada perubahan", async () => {
    await employeeModel.updateOwnProfile(EMPLOYEE_ID, {});

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("UPDATE");
    expect(sql).toContain("SELECT");
  });

  it("mengembalikan null jika karyawan tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const employee = await employeeModel.updateOwnProfile(EMPLOYEE_ID, {
      full_name: "Nama Baru",
    });

    expect(employee).toBeNull();
  });
});

describe("updateEmployee", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakeEmployee] } as never);
  });

  it("hanya memperbarui kolom yang dikirim", async () => {
    await employeeModel.updateEmployee(EMPLOYEE_ID, {
      full_name: "Nama Baru",
    });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("full_name = $1");
    expect(sql).not.toContain("phone =");
    expect(values).toEqual(["Nama Baru", EMPLOYEE_ID]);
  });

  it("mengabaikan kolom yang tidak boleh diubah", async () => {
    await employeeModel.updateEmployee(EMPLOYEE_ID, {
      full_name: "Nama Baru",
      employee_number: "999",
      user_id: "lain",
      id: "lain",
    } as never);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("employee_number");
    expect(sql).not.toContain("user_id");
  });

  it("mengabaikan field yang bernilai undefined", async () => {
    await employeeModel.updateEmployee(EMPLOYEE_ID, {
      full_name: "Nama Baru",
      address: undefined,
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("address");
  });

  it("menambahkan cast tipe untuk kolom enum dan uuid", async () => {
    await employeeModel.updateEmployee(EMPLOYEE_ID, {
      gender: "female",
      employment_status: "permanent",
      department_id: DEPARTMENT_ID,
      join_date: "2024-01-01",
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("::employee_gender");
    expect(sql).toContain("::employment_status");
    expect(sql).toContain("::uuid");
    expect(sql).toContain("::date");
  });

  it("selalu memperbarui kolom updated_at", async () => {
    await employeeModel.updateEmployee(EMPLOYEE_ID, { full_name: "Nama Baru" });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("updated_at = now()");
  });

  it("tidak menyentuh karyawan yang sudah dihapus", async () => {
    await employeeModel.updateEmployee(EMPLOYEE_ID, { full_name: "Nama Baru" });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });

  it("tidak menjalankan UPDATE jika tidak ada perubahan", async () => {
    await employeeModel.updateEmployee(EMPLOYEE_ID, {});

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("UPDATE");
    expect(sql).toContain("SELECT");
  });

  it("mengembalikan null jika karyawan tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const employee = await employeeModel.updateEmployee(EMPLOYEE_ID, {
      full_name: "Nama Baru",
    });

    expect(employee).toBeNull();
  });
});

describe("softDeleteEmployee", () => {
  const fakeDb = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeEmployee],
    } as never);
  });

  it("menandai deleted_at tanpa menghapus baris", async () => {
    await employeeModel.softDeleteEmployee(fakeDb as never, EMPLOYEE_ID);

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("deleted_at = now()");
    expect(sql).not.toContain("DELETE FROM");
  });

  it("sekaligus menonaktifkan karyawan", async () => {
    await employeeModel.softDeleteEmployee(fakeDb as never, EMPLOYEE_ID);

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("is_active = false");
  });

  it("tidak menghapus ulang karyawan yang sudah dihapus", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    const employee = await employeeModel.softDeleteEmployee(
      fakeDb as never,
      EMPLOYEE_ID,
    );

    expect(employee).toBeNull();
  });
});

describe("findById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan karyawan jika ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeEmployee] } as never);

    const employee = await employeeModel.findById(EMPLOYEE_ID);

    expect(employee?.id).toBe(EMPLOYEE_ID);
  });

  it("mengembalikan null jika tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const employee = await employeeModel.findById(EMPLOYEE_ID);

    expect(employee).toBeNull();
  });

  it("mengirim id sebagai parameter dan mengabaikan data terhapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await employeeModel.findById(EMPLOYEE_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("$1");
    expect(sql).toContain("deleted_at IS NULL");
    expect(values).toEqual([EMPLOYEE_ID]);
  });
});

describe("findByUserId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mencari berdasarkan kolom user_id", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeEmployee] } as never);

    await employeeModel.findByUserId(USER_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("user_id = $1");
    expect(values).toEqual([USER_ID]);
  });

  it("mengembalikan null jika akun belum punya data karyawan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const employee = await employeeModel.findByUserId(USER_ID);

    expect(employee).toBeNull();
  });
});

describe("findDetailById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menggabungkan data departemen, jabatan, manajer, dan email", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await employeeModel.findDetailById(EMPLOYEE_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("LEFT JOIN users");
    expect(sql).toContain("LEFT JOIN departments");
    expect(sql).toContain("LEFT JOIN positions");
    expect(sql).toContain("LEFT JOIN employees m");
  });

  it("memakai LEFT JOIN agar karyawan tanpa relasi tetap tampil", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: EMPLOYEE_ID,
          employee_number: "001",
          full_name: "Ismail Muhammad",
          email: null,
          position_name: null,
          department_name: null,
          manager_name: null,
          is_active: true,
        },
      ],
    } as never);

    const detail = await employeeModel.findDetailById(EMPLOYEE_ID);

    expect(detail?.department_name).toBeNull();
    expect(detail?.manager_name).toBeNull();
  });

  it("mengembalikan null jika tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const detail = await employeeModel.findDetailById(EMPLOYEE_ID);

    expect(detail).toBeNull();
  });

  it("mengabaikan karyawan yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await employeeModel.findDetailById(EMPLOYEE_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });
});

describe("listEmployees", () => {
  // query hitungan dan query data memakai array parameter yang sama,
  // dua nilai terakhir selalu limit dan offset
  function filterValues(): unknown[] {
    const [, values] = mockQuery.mock.calls[1] as [string, unknown[]];
    return values.slice(0, -2);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "42" }] } as never)
      .mockResolvedValueOnce({ rows: [fakeEmployee] } as never);
  });

  it("menjalankan query hitungan dan query data", async () => {
    await employeeModel.listEmployees({ page: 1, limit: 10 });

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [countSql] = mockQuery.mock.calls[0] as [string];
    const [dataSql] = mockQuery.mock.calls[1] as [string];

    expect(countSql).toContain("COUNT(*)");
    expect(dataSql).toContain("LIMIT");
  });

  it("mengubah hasil hitungan menjadi angka", async () => {
    const { total } = await employeeModel.listEmployees({ page: 1, limit: 10 });

    expect(total).toBe(42);
    expect(typeof total).toBe("number");
  });

  it("mengembalikan total nol jika tabel kosong", async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const { total, rows } = await employeeModel.listEmployees({
      page: 1,
      limit: 10,
    });

    expect(total).toBe(0);
    expect(rows).toEqual([]);
  });

  it("selalu menyaring karyawan yang sudah dihapus", async () => {
    await employeeModel.listEmployees({ page: 1, limit: 10 });

    const [countSql] = mockQuery.mock.calls[0] as [string];

    expect(countSql).toContain("e.deleted_at IS NULL");
  });

  it("tidak menambah filter jika tidak ada parameter pencarian", async () => {
    await employeeModel.listEmployees({ page: 1, limit: 10 });

    expect(filterValues()).toEqual([]);
  });

  it("mencari pada nama, nomor karyawan, dan email sekaligus", async () => {
    await employeeModel.listEmployees({ page: 1, limit: 10, search: "ismail" });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("e.full_name ILIKE $1");
    expect(sql).toContain("e.employee_number ILIKE $1");
    expect(sql).toContain("u.email ILIKE $1");
    expect(filterValues()).toEqual(["%ismail%"]);
  });

  it("menyaring berdasarkan departemen", async () => {
    await employeeModel.listEmployees({
      page: 1,
      limit: 10,
      department_id: DEPARTMENT_ID,
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("e.department_id = $1::uuid");
    expect(filterValues()).toEqual([DEPARTMENT_ID]);
  });

  it("menyaring karyawan nonaktif", async () => {
    await employeeModel.listEmployees({
      page: 1,
      limit: 10,
      is_active: false,
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("e.is_active = $1");
    expect(filterValues()).toEqual([false]);
  });

  it("menggabungkan beberapa filter sekaligus", async () => {
    await employeeModel.listEmployees({
      page: 1,
      limit: 10,
      search: "ismail",
      department_id: DEPARTMENT_ID,
      is_active: true,
    });

    expect(filterValues()).toEqual(["%ismail%", DEPARTMENT_ID, true]);
  });

  it("menghitung offset dari halaman dan batas", async () => {
    await employeeModel.listEmployees({ page: 3, limit: 10 });

    const [, values] = mockQuery.mock.calls[1] as [string, unknown[]];

    expect(values).toEqual([10, 20]);
  });

  it("tidak memberi offset pada halaman pertama", async () => {
    await employeeModel.listEmployees({ page: 1, limit: 25 });

    const [, values] = mockQuery.mock.calls[1] as [string, unknown[]];

    expect(values).toEqual([25, 0]);
  });

  it("mengurutkan berdasarkan nomor karyawan", async () => {
    await employeeModel.listEmployees({ page: 1, limit: 10 });

    const [dataSql] = mockQuery.mock.calls[1] as [string];

    expect(dataSql).toContain("ORDER BY e.employee_number ASC");
  });

  it("tidak menyisipkan kata kunci pencarian langsung ke SQL", async () => {
    await employeeModel.listEmployees({
      page: 1,
      limit: 10,
      search: "'; DROP TABLE employees; --",
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("DROP TABLE");
  });
});

describe("findSubordinates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mencari karyawan yang manajernya adalah id yang diberikan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await employeeModel.findSubordinates(MANAGER_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("manager_id = $1::uuid");
    expect(values).toEqual([MANAGER_ID]);
  });

  it("mengabaikan bawahan yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await employeeModel.findSubordinates(MANAGER_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });

  it("mengembalikan daftar kosong jika tidak punya bawahan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const rows = await employeeModel.findSubordinates(MANAGER_ID);

    expect(rows).toEqual([]);
  });

  it("mengembalikan identitas ringkas setiap bawahan", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: EMPLOYEE_ID, employee_number: "002", full_name: "Bawahan Satu" },
      ],
    } as never);

    const rows = await employeeModel.findSubordinates(MANAGER_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.full_name).toBe("Bawahan Satu");
  });
});

describe("isDescendantOf", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menelusuri rantai manajer secara rekursif", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await employeeModel.isDescendantOf(MANAGER_ID, EMPLOYEE_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("WITH RECURSIVE");
    expect(values).toEqual([MANAGER_ID, EMPLOYEE_ID]);
  });

  it("mengembalikan true jika calon manajer masih bawahan karyawan", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: EMPLOYEE_ID }] } as never);

    const siklus = await employeeModel.isDescendantOf(MANAGER_ID, EMPLOYEE_ID);

    expect(siklus).toBe(true);
  });

  it("mengembalikan false jika tidak membentuk lingkaran", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const siklus = await employeeModel.isDescendantOf(MANAGER_ID, EMPLOYEE_ID);

    expect(siklus).toBe(false);
  });

  it("mengabaikan karyawan yang sudah dihapus saat menelusuri", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await employeeModel.isDescendantOf(MANAGER_ID, EMPLOYEE_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });
});

describe("createEmployees menolak karyawan tanpa akun", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("melempar galat bila ada user_id yang kosong", async () => {
    await expect(
      employeeModel.createEmployees({ query: mockQuery } as never, [
        { user_id: "", data: { full_name: "A", phone: "+62811", gender: "male" } },
      ] as never),
    ).rejects.toThrow("tidak boleh disimpan tanpa akun");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("melempar galat bila baris yang tersimpan tidak sebanyak yang dikirim", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: "e1" }] } as never);

    await expect(
      employeeModel.createEmployees({ query: mockQuery } as never, [
        { user_id: "u1", data: { full_name: "A", phone: "+62811", gender: "male" } },
        { user_id: "u2", data: { full_name: "B", phone: "+62811", gender: "male" } },
      ] as never),
    ).rejects.toThrow("Gagal menyimpan sebagian data karyawan");
  });
});
