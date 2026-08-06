import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const userModel = await import("../../src/models/user.js");

const fakeUser = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "ismail@awan.io",
    role: "employee",
    is_active: false,
    terms_accepted_at: new Date(),
    approved_at: null,
    approved_by: null,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date()
};

describe("insertUser", () => {
    const fakeDb = { query: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("mengirim parameter dalam urutan yang benar", async () => {
        (fakeDb.query as jest.Mock).mockResolvedValue({rows: [fakeUser],} as never);
        const waktu = new Date();
        await userModel.insertUser(
            fakeDb as never,
            "ismail@awan.io",
            "hash-argon2",
            "employee",
            waktu,
        );

    const [, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(values).toEqual([
      "ismail@awan.io",
      "hash-argon2",
      "employee",
      waktu,
    ]);
  });

    it("tidak mengembalikan kolom password", async () => {

        (fakeDb.query as jest.Mock).mockResolvedValue({rows: [fakeUser],} as never);

        await userModel.insertUser(
            fakeDb as never,
            "ismail@awan.io",
            "hash-argon2",
            "employee",
            new Date(),
        );

        const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];
        const returning = sql.split("RETURNING")[1] ?? "";

        expect(returning).not.toContain("password");
    });

    it("memakai parameterized query, bukan interpolasi", async () => {
        (fakeDb.query as jest.Mock).mockResolvedValue({rows: [fakeUser],} as never);
        await userModel.insertUser(
            fakeDb as never,
            "ismail@awan.io",
            "hash-argon2",
            "employee",
            new Date(),
        );

        const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

        expect(sql).toContain("$1");
        expect(sql).not.toContain("ismail@awan.io");
    });

    it("melempar error jika tidak ada baris yang tersimpan", async () => {
        (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

        await expect(
            userModel.insertUser(
            fakeDb as never,
            "ismail@awan.io",
            "hash",
            "employee",
            new Date(),
            ),
        ).rejects.toThrow("Gagal menyimpan user");
    });

    it("dapat dijalankan memakai client transaksi", async () => {
        const client = { query: jest.fn() };
        (client.query as jest.Mock).mockResolvedValue({rows: [fakeUser],} as never);
        await userModel.insertUser(
        client as never,
        "ismail@awan.io",
        "hash",
        "employee",
        new Date(),
        );

        expect(client.query).toHaveBeenCalled();
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

describe("findByEmail", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("mengembalikan user jika ditemukan", async () => {
        mockQuery.mockResolvedValue({rows: [{ ...fakeUser, password: "hash" }],} as never);
        const user = await userModel.findByEmail("ismail@awan.io");

        expect(user?.email).toBe("ismail@awan.io");
    });
    it("mengembalikan null jika tidak ditemukan", async () => {
        mockQuery.mockResolvedValue({ rows: [] } as never);
        const user = await userModel.findByEmail("tidakada@awan.io");
        expect(user).toBeNull();
    });

    it("mengirim email sebagai parameter, bukan disisipkan ke SQL", async () => {
        mockQuery.mockResolvedValue({ rows: [] } as never);
        await userModel.findByEmail("ismail@awan.io");

        const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain("$1");
        expect(values).toEqual(["ismail@awan.io"]);
    });

    it("mengambil kolom password untuk keperluan verifikasi login", async () => {
        mockQuery.mockResolvedValue({ rows: [] } as never);

        await userModel.findByEmail("ismail@awan.io");
        const [sql] = mockQuery.mock.calls[0] as [string];
        expect(sql).toContain("SELECT *");
    });
});

describe("findById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("mengembalikan user jika ditemukan", async () => {
        mockQuery.mockResolvedValue({ rows: [fakeUser] } as never);

        const user = await userModel.findById(fakeUser.id);

        expect(user?.id).toBe(fakeUser.id);
    });

    it("mengembalikan null jika tidak ditemukan", async () => {
        mockQuery.mockResolvedValue({ rows: [] } as never);

        const user = await userModel.findById("id-tidak-ada");

        expect(user).toBeNull();
    });

    it("tidak mengambil kolom password", async () => {
        mockQuery.mockResolvedValue({ rows: [] } as never);

        await userModel.findById(fakeUser.id);

        const [sql] = mockQuery.mock.calls[0] as [string];

        expect(sql).not.toContain("password");
    });
});

describe("updateLastLogin", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("memperbarui kolom last_login_at untuk id yang diberikan", async () => {
        mockQuery.mockResolvedValue({ rows: [] } as never);

        await userModel.updateLastLogin(fakeUser.id);

        const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("last_login_at");
        expect(values).toEqual([fakeUser.id]);
    });
});