import { describe, expect, it } from "@jest/globals";
import { plural } from "../../src/helpers/plural.js";

describe("plural", () => {
  it("memakai bentuk tunggal untuk angka satu", () => {
    expect(plural(1, "day")).toBe("1 day");
  });

  it("memakai bentuk jamak untuk angka selain satu", () => {
    expect(plural(0, "day")).toBe("0 days");
    expect(plural(3, "day")).toBe("3 days");
  });

  it("minus satu tetap tunggal", () => {
    expect(plural(-1, "day")).toBe("-1 day");
  });
});
