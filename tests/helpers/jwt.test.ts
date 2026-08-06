import { describe, it, expect } from "@jest/globals";
import { createToken, verifyToken } from "../../src/helpers/jwt.js";

const payload = {
    id: "a78bcea9-27de-44bd-a4f0-2cf635165d60",
    email: "ismail@awan.io",
    role: "employee" as const,
};

describe("jwt helper", () => {
    it("menghasilkan token dengan tiga bagian", () => {
        const token = createToken(payload);
        expect(token.split(".")).toHaveLength(3);
    });

    it("memverifikasi token yang sah dan mengembalikan payload", () => {
        const token = createToken(payload);
        const decoded = verifyToken(token);

        expect(decoded.id).toBe(payload.id);
        expect(decoded.email).toBe(payload.email);
        expect(decoded.role).toBe(payload.role);
    });

    it("tidak menyimpan password di dalam token", () => {
        const token = createToken(payload);
        const decoded = verifyToken(token);
        expect(decoded).not.toHaveProperty("password");
    });

    it("menyertakan masa berlaku pada token", () => {
        const token = createToken(payload);
        const decoded = verifyToken(token) as unknown as {
            iat: number;
            exp: number;
    };

    expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    it("menolak token yang diubah", () => {
        const token = createToken(payload);
        expect(() => verifyToken(token + "x")).toThrow();
    });

    it("menolak string yang bukan token", () => {
        expect(() => verifyToken("bukan-token")).toThrow();});
});