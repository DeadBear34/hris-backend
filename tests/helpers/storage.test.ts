import { describe, it, expect } from "@jest/globals";
import { buildPhotoPath, buildStoragePath } from "../../src/helpers/storage.js";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

// Nama berkas memuat waktu sekarang, jadi yang diuji bentuknya, bukan nilainya.
// Ketepatan waktunya sendiri diuji pada fileStampOf di timezone.test.ts

describe("jalurLampiran", () => {
  it("mengarsipkan per bulan lalu per pengajuan", () => {
    expect(buildStoragePath(REQUEST_ID, "image/jpeg")).toMatch(
      new RegExp(
        `^\\d{4}/\\d{2}/${REQUEST_ID}/\\d{8}-\\d{6}-[0-9a-f]{6}\\.jpg$`,
      ),
    );
  });

  it("memakai ekstensi sesuai jenis berkas", () => {
    expect(buildStoragePath(REQUEST_ID, "image/png")).toMatch(/\.png$/);
    expect(buildStoragePath(REQUEST_ID, "image/webp")).toMatch(/\.webp$/);
  });

  it("tidak dapat keluar dari foldernya sendiri", () => {
    expect(buildStoragePath(REQUEST_ID, "image/jpeg")).not.toContain("..");
  });
});

describe("jalurFotoProfil", () => {
  it("diarsipkan per bulan dengan id karyawan di nama berkas", () => {
    expect(buildPhotoPath(EMPLOYEE_ID, "image/jpeg")).toMatch(
      new RegExp(
        String.raw`^\d{4}/\d{2}/${EMPLOYEE_ID}-\d{8}-\d{6}-[0-9a-f]{6}\.jpg$`,
      ),
    );
  });

  it("id karyawan tidak lagi menjadi folder tersendiri", () => {
    const path = buildPhotoPath(EMPLOYEE_ID, "image/jpeg");

    // Folder bulan berisi berkasnya langsung, jadi hanya ada dua tingkat
    expect(path.split("/")).toHaveLength(3);
    expect(path.startsWith(`${EMPLOYEE_ID}/`)).toBe(false);
  });

  it("dua unggahan berturut-turut tidak menghasilkan nama yang sama", () => {
    // Bucket foto memakai upsert: false, nama yang bertabrakan membuat
    // unggahan kedua gagal walaupun terjadi pada detik yang sama
    const names = new Set(
      Array.from({ length: 50 }, () =>
        buildPhotoPath(EMPLOYEE_ID, "image/jpeg"),
      ),
    );

    expect(names.size).toBe(50);
  });
});
