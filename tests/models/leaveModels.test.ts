import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const holidayModel = await import("../../src/models/holiday.js");
const leaveTypeModel = await import("../../src/models/leaveType.js");
const leaveRequestModel = await import("../../src/models/leaveRequest.js");
const balanceModel = await import("../../src/models/leaveBalance.js");
const attachmentModel = await import("../../src/models/leaveAttachment.js");

const HOLIDAY_ID = "11111111-1111-4111-8111-111111111111";
const LEAVE_TYPE_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const ATTACHMENT_ID = "55555555-5555-4555-8555-555555555555";

const fakeDb = { query: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
  (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [{}] } as never);
});

describe("model holiday", () => {
  it("mengembalikan tanggal sebagai teks agar tidak bergeser zona waktu", async () => {
    await holidayModel.findById(HOLIDAY_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("holiday_date::text");
  });

  it("mencari tanggal libur dalam rentang dengan cast date", async () => {
    await holidayModel.findDatesBetween("2026-01-01", "2026-01-31");

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("BETWEEN $1::date AND $2::date");
    expect(values).toEqual(["2026-01-01", "2026-01-31"]);
  });

  it("mengembalikan daftar tanggal saja", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ holiday_date: "2026-08-17" }],
    } as never);

    const tanggal = await holidayModel.findDatesBetween(
      "2026-08-01",
      "2026-08-31",
    );

    expect(tanggal).toEqual(["2026-08-17"]);
  });

  it("menyaring daftar berdasarkan tahun", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "9" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await holidayModel.listHolidays({ year: 2026, page: 1, limit: 10 });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("EXTRACT(YEAR FROM holiday_date)");
  });

  it("menghitung offset paginasi", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "20" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await holidayModel.listHolidays({ page: 3, limit: 5 });

    const [, values] = mockQuery.mock.calls[1] as [string, unknown[]];

    expect(values.slice(-2)).toEqual([5, 10]);
  });

  it("menolak duplikasi lewat pencarian berdasarkan tanggal", async () => {
    await holidayModel.findByDate("2026-08-17");

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("holiday_date = $1::date");
    expect(values).toEqual(["2026-08-17"]);
  });

  it("hari libur dihapus permanen karena tidak dirujuk tabel lain", async () => {
    await holidayModel.deleteHoliday(HOLIDAY_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("DELETE FROM holidays");
  });

  it("hanya memperbarui kolom yang ada di daftar putih", async () => {
    mockQuery.mockResolvedValue({ rows: [{}] } as never);

    await holidayModel.updateHoliday(HOLIDAY_ID, {
      name: "Nama Baru",
      id: "lain",
    } as never);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("name = $1");
    expect(sql).not.toContain("id = $1");
  });

  it("melempar error jika penyimpanan gagal", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await expect(
      holidayModel.createHoliday(
        { holiday_date: "2026-08-17", name: "Kemerdekaan" },
        fakeDb as never,
      ),
    ).rejects.toThrow("Gagal menyimpan hari libur");
  });
});

describe("model leaveType", () => {
  it("mengembalikan jatah sebagai angka, bukan teks", async () => {
    await leaveTypeModel.findById(LEAVE_TYPE_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("default_quota::float8");
  });

  it("mengabaikan jenis cuti yang sudah dihapus", async () => {
    await leaveTypeModel.findByCode("ANNUAL");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });

  it("dapat menyaring hanya jenis cuti aktif", async () => {
    await leaveTypeModel.findAll(true);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("is_active = true");
  });

  it("memakai cast enum untuk batasan gender", async () => {
    mockQuery.mockResolvedValue({ rows: [{}] } as never);

    await leaveTypeModel.updateLeaveType(LEAVE_TYPE_ID, {
      gender_restriction: "female",
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("::employee_gender");
  });

  it("menandai penghapusan tanpa membuang baris", async () => {
    mockQuery.mockResolvedValue({ rows: [{}] } as never);

    await leaveTypeModel.softDeleteLeaveType(LEAVE_TYPE_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at = now()");
    expect(sql).not.toContain("DELETE FROM");
  });

  it("menghitung pengajuan yang memakai jenis cuti", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "4" }] } as never);

    const jumlah = await leaveTypeModel.countLeaveRequests(LEAVE_TYPE_ID);

    expect(jumlah).toBe(4);
  });
});

describe("model leaveRequest", () => {
  it("mengembalikan tanggal sebagai teks dan durasi sebagai angka", async () => {
    await leaveRequestModel.findById(REQUEST_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("start_date::text");
    expect(sql).toContain("total_days::float8");
  });

  it("mencari tumpang tindih hanya pada status yang menahan kuota", async () => {
    await leaveRequestModel.findOverlapping(
      EMPLOYEE_ID,
      "2026-03-02",
      "2026-03-04",
    );

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("status IN ('pending', 'approved')");
  });

  it("mencocokkan tumpang tindih sebagai irisan rentang", async () => {
    await leaveRequestModel.findOverlapping(
      EMPLOYEE_ID,
      "2026-03-02",
      "2026-03-04",
    );

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("lr.start_date <= $3::date");
    expect(sql).toContain("lr.end_date >= $2::date");
  });

  it("menerjemahkan pelanggaran exclusion constraint menjadi konflik", async () => {
    (fakeDb.query as jest.Mock).mockRejectedValue(
      Object.assign(new Error("conflicting key"), { code: "23P01" }) as never,
    );

    await expect(
      leaveRequestModel.createRequest(fakeDb as never, {
        employee_id: EMPLOYEE_ID,
        leave_type_id: LEAVE_TYPE_ID,
        start_date: "2026-03-02",
        end_date: "2026-03-04",
        total_days: 3,
        approver_id: null,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("meneruskan error database lain apa adanya", async () => {
    (fakeDb.query as jest.Mock).mockRejectedValue(
      Object.assign(new Error("koneksi putus"), { code: "08006" }) as never,
    );

    await expect(
      leaveRequestModel.createRequest(fakeDb as never, {
        employee_id: EMPLOYEE_ID,
        leave_type_id: LEAVE_TYPE_ID,
        start_date: "2026-03-02",
        end_date: "2026-03-04",
        total_days: 3,
        approver_id: null,
      }),
    ).rejects.toThrow("koneksi putus");
  });

  it("persetujuan hanya berlaku untuk pengajuan pending", async () => {
    await leaveRequestModel.approveRequest(
      fakeDb as never,
      REQUEST_ID,
      EMPLOYEE_ID,
      null,
    );

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("status = 'pending'::leave_status");
    expect(sql).toContain("decided_at = now()");
  });

  it("pembatalan berlaku untuk pending maupun approved", async () => {
    await leaveRequestModel.cancelRequest(
      fakeDb as never,
      REQUEST_ID,
      EMPLOYEE_ID,
    );

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("'pending'::leave_status");
    expect(sql).toContain("'approved'::leave_status");
  });

  it("menyaring daftar berdasarkan penyetuju tanpa menyertakan yang kosong", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await leaveRequestModel.listRequests({
      approver_id: EMPLOYEE_ID,
      page: 1,
      limit: 10,
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("lr.approver_id = $1::uuid");
    expect(sql).not.toContain("approver_id IS NULL");
  });

  it("menyertakan pengajuan tanpa penyetuju untuk HR", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await leaveRequestModel.listRequests({
      approver_id: EMPLOYEE_ID,
      include_unassigned: true,
      page: 1,
      limit: 10,
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("lr.approver_id IS NULL");
  });

  it("memakai cast enum saat menyaring status", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await leaveRequestModel.listRequests({
      status: "pending",
      page: 1,
      limit: 10,
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("::leave_status");
  });
});

describe("model leaveBalance", () => {
  it("menyimpan transaksi dengan cast enum dan numeric", async () => {
    await balanceModel.createTransaction(fakeDb as never, {
      employee_id: EMPLOYEE_ID,
      leave_type_id: LEAVE_TYPE_ID,
      period_year: 2026,
      amount: -3,
      type: "hold",
    });

    const [sql, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(sql).toContain("::leave_transaction_type");
    expect(sql).toContain("$4::numeric");
    expect(values[3]).toBe(-3);
  });

  it("melempar error jika transaksi gagal disimpan", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await expect(
      balanceModel.createTransaction(fakeDb as never, {
        employee_id: EMPLOYEE_ID,
        leave_type_id: LEAVE_TYPE_ID,
        period_year: 2026,
        amount: 1,
        type: "accrual",
      }),
    ).rejects.toThrow("Gagal menyimpan transaksi saldo cuti");
  });

  it("menghitung saldo dari penjumlahan seluruh baris", async () => {
    mockQuery.mockResolvedValue({ rows: [{ balance: 9 }] } as never);

    const saldo = await balanceModel.balanceFor(
      EMPLOYEE_ID,
      LEAVE_TYPE_ID,
      2026,
    );

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("SUM(amount)");
    expect(saldo).toBe(9);
  });

  it("mengembalikan nol saat belum ada transaksi", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const saldo = await balanceModel.balanceFor(
      EMPLOYEE_ID,
      LEAVE_TYPE_ID,
      2026,
    );

    expect(saldo).toBe(0);
  });

  it("ringkasan hanya memuat jenis cuti yang memotong saldo", async () => {
    await balanceModel.summaryFor(EMPLOYEE_ID, 2026);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("lt.deducts_balance = true");
    expect(sql).toContain("LEFT JOIN leave_balance_transactions");
  });

  it("mengubah penahanan menjadi pemotongan tanpa mengubah nilainya", async () => {
    await balanceModel.convertHoldToDeduction(fakeDb as never, REQUEST_ID);

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("SET type = 'deduction'::leave_transaction_type");
    expect(sql).toContain("type = 'hold'::leave_transaction_type");
    expect(sql).not.toContain("amount =");
  });

  it("ledger diurutkan dari yang terbaru", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await balanceModel.listLedger({
      employee_id: EMPLOYEE_ID,
      page: 1,
      limit: 10,
    });

    const [sql] = mockQuery.mock.calls[1] as [string];

    expect(sql).toContain("ORDER BY t.created_at DESC");
  });
});

describe("model leaveAttachment", () => {
  it("menyimpan jalur berkas beserta metadatanya", async () => {
    await attachmentModel.createAttachment(
      {
        leave_request_id: REQUEST_ID,
        storage_path: `${REQUEST_ID}/berkas.jpg`,
        file_name: "surat-dokter.jpg",
        mime_type: "image/jpeg",
        file_size: 1024,
        checksum: "abc",
        uploaded_by: EMPLOYEE_ID,
      },
      fakeDb as never,
    );

    const [sql, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(sql).toContain("INSERT INTO leave_attachments");
    expect(sql).toContain("$5::bigint");
    expect(values[1]).toBe(`${REQUEST_ID}/berkas.jpg`);
  });

  it("melempar error jika lampiran gagal disimpan", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await expect(
      attachmentModel.createAttachment(
        {
          leave_request_id: REQUEST_ID,
          storage_path: "x",
          file_name: "x.jpg",
          mime_type: "image/jpeg",
          file_size: 1,
        },
        fakeDb as never,
      ),
    ).rejects.toThrow("Gagal menyimpan lampiran");
  });

  it("mengambil lampiran milik satu pengajuan", async () => {
    await attachmentModel.findByRequest(REQUEST_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("leave_request_id = $1::uuid");
    expect(values).toEqual([REQUEST_ID]);
  });

  it("menghitung lampiran untuk pemeriksaan kewajiban bukti", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "2" }] } as never);

    const jumlah = await attachmentModel.countByRequest(REQUEST_ID);

    expect(jumlah).toBe(2);
  });

  it("mencari lampiran berdasarkan id", async () => {
    await attachmentModel.findById(ATTACHMENT_ID);

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values).toEqual([ATTACHMENT_ID]);
  });
});
