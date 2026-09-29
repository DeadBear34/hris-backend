import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Klien Supabase ditiru supaya perilaku unggah bisa diuji tanpa jaringan
const mockUpload = jest.fn();

jest.unstable_mockModule("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: mockUpload }) },
  }),
}));

jest.unstable_mockModule("../../src/config/env.js", () => ({
  env: {
    SUPABASE_URL: "https://contoh.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "kunci-uji",
    SUPABASE_STORAGE_BUCKET: "leave-attachments",
    SUPABASE_PHOTO_BUCKET: "employee-photos",
    TIMEZONE: "Asia/Jakarta",
  },
}));

const {
  baseNameOf,
  buildPhotoPath,
  buildStoragePath,
  uploadAttachment,
  uploadPhoto,
} = await import("../../src/helpers/storage.js");

// 2026-09-28 03:33:29 UTC = 2026-09-28 10:33:29 WIB
const AT = new Date("2026-09-28T03:33:29Z");

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null } as never);
});

describe("baseNameOf", () => {
  it("mempertahankan nama asli tanpa ekstensinya", () => {
    expect(baseNameOf("surat-dokter.jpg", "lampiran")).toBe("surat-dokter");
  });

  it("mengubah spasi menjadi tanda hubung", () => {
    expect(baseNameOf("Surat Dokter Budi.png", "lampiran")).toBe(
      "Surat-Dokter-Budi",
    );
  });

  it("hanya membuang ekstensi terakhir", () => {
    expect(baseNameOf("scan.hal.1.jpg", "lampiran")).toBe("scan.hal.1");
  });

  it("mengubah huruf beraksen ke huruf dasarnya", () => {
    expect(baseNameOf("fotó José.jpg", "foto")).toBe("foto-Jose");
  });

  it("membaca ulang nama UTF-8 yang terbaca sebagai latin1 oleh multer", () => {
    // Beginilah "fotó.jpg" tiba dari multer
    const asLatin1 = Buffer.from("fotó.jpg", "utf8").toString("latin1");

    expect(baseNameOf(asLatin1, "foto")).toBe("foto");
  });

  it("membuang jalur folder sehingga tidak bisa keluar dari folder bulan", () => {
    expect(baseNameOf("../../rahasia.jpg", "lampiran")).toBe("rahasia");
    expect(baseNameOf("C:\\fakepath\\ktp.jpg", "lampiran")).toBe("ktp");
  });

  it("membuang simbol berbahaya dari nama", () => {
    expect(baseNameOf("foto#1 @kantor!.jpg", "foto")).toBe("foto1-kantor");
  });

  it("garis miring di dalam nama tetap dianggap pemisah folder", () => {
    // "</script>" memuat "/", jadi hanya bagian setelahnya yang tersisa.
    // Hasilnya aman: tidak ada tanda kurung sudut maupun jalur folder
    expect(baseNameOf("<script>alert(1)</script>.png", "foto")).toBe("script");
  });

  it("merapikan tanda pemisah yang berulang atau menggantung", () => {
    expect(baseNameOf("--foto   profil__.jpg", "foto")).toBe("foto-profil");
  });

  it("membatasi panjang nama", () => {
    expect(baseNameOf(`${"a".repeat(200)}.jpg`, "foto")).toHaveLength(80);
  });

  it("memakai nama cadangan bila tidak ada yang tersisa", () => {
    expect(baseNameOf("@#$%.jpg", "foto")).toBe("foto");
    expect(baseNameOf(undefined, "lampiran")).toBe("lampiran");
    expect(baseNameOf("", "lampiran")).toBe("lampiran");
  });
});

describe("jalurLampiran", () => {
  it("berbentuk folder bulan lalu nama asli, tanggal, dan jam", () => {
    expect(buildStoragePath("surat-dokter.jpg", "image/jpeg", 1, AT)).toBe(
      "2026/09/surat-dokter_28-09-2026_10-33-29.jpg",
    );
  });

  it("ekstensi mengikuti isi berkas, bukan nama aslinya", () => {
    expect(buildStoragePath("gambar.jpg", "image/png", 1, AT)).toBe(
      "2026/09/gambar_28-09-2026_10-33-29.png",
    );
  });

  it("menambahkan akhiran angka pada percobaan kedua dan seterusnya", () => {
    expect(buildStoragePath("surat.jpg", "image/jpeg", 2, AT)).toBe(
      "2026/09/surat_28-09-2026_10-33-29_2.jpg",
    );
  });

  it("memakai nama cadangan bila nama aslinya tidak ada", () => {
    expect(buildStoragePath(undefined, "image/jpeg", 1, AT)).toBe(
      "2026/09/lampiran_28-09-2026_10-33-29.jpg",
    );
  });

  it("semua berkas bulan itu berada langsung di folder bulannya", () => {
    expect(
      buildStoragePath("a.jpg", "image/jpeg", 1, AT).split("/"),
    ).toHaveLength(3);
  });
});

describe("jalurFotoProfil", () => {
  it("berbentuk folder bulan lalu nama asli, tanggal, dan jam", () => {
    expect(buildPhotoPath("Foto Profil.png", "image/png", 1, AT)).toBe(
      "2026/09/Foto-Profil_28-09-2026_10-33-29.png",
    );
  });

  it("memakai nama cadangan foto bila nama aslinya tidak ada", () => {
    expect(buildPhotoPath(undefined, "image/webp", 1, AT)).toBe(
      "2026/09/foto_28-09-2026_10-33-29.webp",
    );
  });
});

describe("unggah dengan penanganan nama kembar", () => {
  const conflict = {
    error: { message: "The resource already exists", statusCode: "409" },
  };

  it("mengembalikan jalur yang dipakai saat nama belum ada", async () => {
    const path = await uploadAttachment(
      "surat.jpg",
      Buffer.from("x"),
      "image/jpeg",
    );

    expect(path).toMatch(
      /^\d{4}\/\d{2}\/surat_\d{2}-\d{2}-\d{4}_\d{2}-\d{2}-\d{2}\.jpg$/,
    );
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("tidak pernah menimpa berkas yang sudah ada", async () => {
    await uploadAttachment("surat.jpg", Buffer.from("x"), "image/jpeg");

    const [, , options] = mockUpload.mock.calls[0] as [
      string,
      Buffer,
      { upsert: boolean },
    ];

    expect(options.upsert).toBe(false);
  });

  it("mencoba akhiran _2 bila nama sudah dipakai pada detik yang sama", async () => {
    mockUpload
      .mockResolvedValueOnce(conflict as never)
      .mockResolvedValueOnce({ error: null } as never);

    const path = await uploadPhoto(
      "IMG_0001.jpg",
      Buffer.from("x"),
      "image/jpeg",
    );

    const [first] = mockUpload.mock.calls[0] as [string];
    const [second] = mockUpload.mock.calls[1] as [string];

    expect(first).toMatch(/IMG_0001_[\d-]+_[\d-]+\.jpg$/);
    expect(second).toMatch(/IMG_0001_[\d-]+_[\d-]+_2\.jpg$/);
    expect(path).toBe(second);
  });

  it("seluruh percobaan memakai detik yang sama", async () => {
    mockUpload
      .mockResolvedValueOnce(conflict as never)
      .mockResolvedValueOnce({ error: null } as never);

    await uploadAttachment("surat.jpg", Buffer.from("x"), "image/jpeg");

    const [first] = mockUpload.mock.calls[0] as [string];
    const [second] = mockUpload.mock.calls[1] as [string];

    expect(second.replace("_2.jpg", ".jpg")).toBe(first);
  });

  it("menyerah setelah beberapa kali nama tetap kembar", async () => {
    mockUpload.mockResolvedValue(conflict as never);

    await expect(
      uploadAttachment("surat.jpg", Buffer.from("x"), "image/jpeg"),
    ).rejects.toThrow("no free file name");
    expect(mockUpload).toHaveBeenCalledTimes(5);
  });

  it("tidak mencoba ulang untuk kegagalan selain nama kembar", async () => {
    mockUpload.mockResolvedValue({
      error: { message: "bucket penuh", statusCode: "413" },
    } as never);

    await expect(
      uploadPhoto("foto.jpg", Buffer.from("x"), "image/jpeg"),
    ).rejects.toThrow("Failed to upload profile photo: bucket penuh");
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });
});
