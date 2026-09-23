import { describe, it, expect } from "@jest/globals";
import { parseTrustProxy } from "../../src/config/trustProxy.js";

describe("parseTrustProxy", () => {
  it("mati bila tidak diisi", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
  });

  it("menerjemahkan true dan false", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("mengubah angka menjadi jumlah proxy", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
  });

  it("meneruskan nilai lain apa adanya, misalnya daftar subnet", () => {
    expect(parseTrustProxy("loopback")).toBe("loopback");
    expect(parseTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
  });
});
