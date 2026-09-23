import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response } from "express";

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findByUserId: jest.fn(),
}));

const employeeModel = await import("../../src/models/employee.js");
const { findRequestEmployee, requireRequestEmployee } =
  await import("../../src/helpers/requestEmployee.js");

const fakeEmployee = { id: "employee-1", user_id: "user-1" };

const makeReq = (user?: { id: string }) => ({ user }) as unknown as Request;
const makeRes = () => ({ locals: {} }) as unknown as Response;

beforeEach(() => {
  jest.clearAllMocks();
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
});

describe("findRequestEmployee", () => {
  it("mengambil data karyawan hanya sekali per request", async () => {
    const req = makeReq({ id: "user-1" });
    const res = makeRes();

    await findRequestEmployee(req, res);
    await findRequestEmployee(req, res);

    expect(employeeModel.findByUserId).toHaveBeenCalledTimes(1);
  });

  it("mengembalikan null untuk tamu tanpa menjalankan query", async () => {
    const employee = await findRequestEmployee(makeReq(), makeRes());

    expect(employee).toBeNull();
    expect(employeeModel.findByUserId).not.toHaveBeenCalled();
  });
});

describe("requireRequestEmployee", () => {
  it("menolak tamu dengan 401", async () => {
    await expect(
      requireRequestEmployee(makeReq(), makeRes()),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("menolak akun yang belum terhubung ke data karyawan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    await expect(
      requireRequestEmployee(makeReq({ id: "user-1" }), makeRes()),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
