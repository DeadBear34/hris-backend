import { describe, it, expect } from "@jest/globals";

const { toView, parseEvent } = await import("../../src/realtime/event.js");

const row = {
  id: "n1",
  recipient_user_id: "u1",
  type: "leave_approval_needed" as const,
  title: "Pengajuan cuti baru",
  message: "pesan",
  link: "/leave-management",
  entity: "leave_request",
  entity_id: "r1",
  is_read: false,
  read_at: null,
  created_at: new Date(),
};

describe("bentuk yang dilihat penerima", () => {
  it("tidak membawa kolom internal", () => {
    const view = toView(row);

    expect(view).not.toHaveProperty("recipient_user_id");
    expect(view).not.toHaveProperty("entity");
    expect(view).not.toHaveProperty("entity_id");
  });

  it("membawa kolom yang dibutuhkan frontend", () => {
    expect(Object.keys(toView(row)).sort()).toEqual([
      "created_at",
      "id",
      "is_read",
      "link",
      "message",
      "read_at",
      "title",
      "type",
    ]);
  });
});

describe("penyaringan pesan dari luar proses", () => {
  it("menerima notification.created yang benar", () => {
    const hasil = parseEvent({
      event: "notification.created",
      data: toView(row),
    });

    expect(hasil?.event).toBe("notification.created");
  });

  it("menerima notification.cleared yang benar", () => {
    const hasil = parseEvent({
      event: "notification.cleared",
      ids: ["n1", "n2"],
    });

    expect(hasil).toEqual({
      event: "notification.cleared",
      ids: ["n1", "n2"],
    });
  });

  it.each([
    ["bukan objek", "halo"],
    ["null", null],
    ["tanpa event", { data: {} }],
    ["event tak dikenal", { event: "notification.hapus" }],
    ["created tanpa data", { event: "notification.created" }],
    ["cleared tanpa ids", { event: "notification.cleared" }],
    ["ids bukan array", { event: "notification.cleared", ids: "n1" }],
    ["ids berisi angka", { event: "notification.cleared", ids: [1, 2] }],
  ])("menolak %s", (_label, masukan) => {
    expect(parseEvent(masukan)).toBeNull();
  });
});
