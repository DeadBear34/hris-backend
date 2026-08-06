import { describe, it, expect } from "@jest/globals";
import { registerSchema, loginSchema } from "../../src/schema/authSchema.js";

const validRegister = {
    email: "ismail@awan.io",
    password: "password123",
    full_name: "Ismail Muhammad",
    phone: "+628123456789",
    gender: "male",
    terms_accepted: true,
};

describe("registerSchema", () => {
    it("menerima data yang valid", () => {
        const result = registerSchema.safeParse(validRegister);
        expect(result.success).toBe(true);
    });

    it("mengubah email menjadi huruf kecil", () => {
        const result = registerSchema.safeParse({
        ...validRegister,
        email: "Ismail@Awan.IO",
    });

    expect(result.success).toBe(true);
    if (result.success) {
        expect(result.data.email).toBe("ismail@awan.io");
    }
    });

    it("membuang spasi di awal dan akhir nama", () => {
        const result = registerSchema.safeParse({
        ...validRegister,
        full_name: "  Ismail Muhammad  ",
        });

    expect(result.success).toBe(true);
    if (result.success) {
        expect(result.data.full_name).toBe("Ismail Muhammad");
    }
    });

    it("menolak email tanpa tanda @", () => {
        const result = registerSchema.safeParse({
            ...validRegister,
            email: "bukanemail",}
    );

    expect(result.success).toBe(false);
    if (!result.success) {
        expect(result.error.issues[0]?.path).toContain("email");
    }
    });

    it("menolak password kurang dari 8 karakter", () => {
        const result = registerSchema.safeParse({
            ...validRegister,
            password: "1234567",
        });
        expect(result.success).toBe(false);
    });

    it("menolak nomor telepon tanpa kode negara", () => {
        const result = registerSchema.safeParse({
            ...validRegister,
            phone: "08123456789",
        });
    expect(result.success).toBe(false);
    });

    it("menerima nomor telepon berformat E.164", () => {
        const result = registerSchema.safeParse({
            ...validRegister,
            phone: "+6281234567890",
        });
        expect(result.success).toBe(true);
    });

    it("menolak gender di luar pilihan", () => {
        const result = registerSchema.safeParse({
            ...validRegister,
            gender: "lainnya",
        });
        expect(result.success).toBe(false);
    });

    it("menolak jika syarat dan ketentuan tidak disetujui", () => {
        const result = registerSchema.safeParse({
            ...validRegister,
            terms_accepted: false,
        });
        expect(result.success).toBe(false);
    });

    it("melaporkan seluruh field yang bermasalah sekaligus", () => {
        const result = registerSchema.safeParse({});

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.length).toBeGreaterThanOrEqual(6);
        }
    });
});

describe("loginSchema", () => {
    it("menerima email dan password yang valid", () => {
        const result = loginSchema.safeParse({
            email: "ismail@awan.io",
            password: "password123",
        });
        expect(result.success).toBe(true);
    });

    it("tidak menerapkan panjang minimum password", () => {
        const result = loginSchema.safeParse({
            email: "ismail@awan.io",
            password: "abc",
        });
        expect(result.success).toBe(true);
    });

    it("menolak password kosong", () => {
        const result = loginSchema.safeParse({
            email: "ismail@awan.io",
            password: "",
        });
        expect(result.success).toBe(false);
    });
});