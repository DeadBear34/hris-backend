import { describe, it, expect } from "@jest/globals";
import {
  ALLOWED_MIME_TYPES,
  detectImageMimeType,
  extensionFor,
  MAX_FILE_SIZE,
} from "../../src/helpers/fileType.js";

function berkas(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

const JPEG = berkas(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = berkas(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  berkas(0x00, 0x00, 0x00, 0x00),
  Buffer.from("WEBP"),
]);

describe("detectImageMimeType", () => {
  it("mengenali JPEG dari magic bytes", () => {
    expect(detectImageMimeType(JPEG)).toBe("image/jpeg");
  });

  it("mengenali PNG dari magic bytes", () => {
    expect(detectImageMimeType(PNG)).toBe("image/png");
  });

  it("mengenali WebP dari kontainer RIFF", () => {
    expect(detectImageMimeType(WEBP)).toBe("image/webp");
  });

  it("menolak berkas teks biasa", () => {
    expect(detectImageMimeType(Buffer.from("halo dunia"))).toBeNull();
  });

  it("menolak PDF meski ekstensinya dipalsukan", () => {
    expect(detectImageMimeType(Buffer.from("%PDF-1.7"))).toBeNull();
  });

  it("menolak skrip yang menyamar sebagai gambar", () => {
    expect(
      detectImageMimeType(Buffer.from("<?php system($_GET['c']); ?>")),
    ).toBeNull();
  });

  it("menolak buffer kosong", () => {
    expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it("menolak buffer yang terlalu pendek untuk dikenali", () => {
    expect(detectImageMimeType(berkas(0xff, 0xd8))).toBeNull();
  });

  it("menolak RIFF yang bukan WebP, misalnya WAV", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF"),
      berkas(0x00, 0x00, 0x00, 0x00),
      Buffer.from("WAVE"),
    ]);

    expect(detectImageMimeType(wav)).toBeNull();
  });

  it("menolak PNG yang hanya benar sebagian", () => {
    expect(
      detectImageMimeType(berkas(0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00)),
    ).toBeNull();
  });

  it("hanya mengembalikan tipe yang ada di daftar izin", () => {
    for (const buffer of [JPEG, PNG, WEBP]) {
      const mime = detectImageMimeType(buffer);

      expect(ALLOWED_MIME_TYPES).toContain(mime);
    }
  });
});

describe("extensionFor", () => {
  it("memetakan setiap tipe ke ekstensinya", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
  });
});

describe("batas ukuran", () => {
  it("sama dengan constraint 5 MB di database", () => {
    expect(MAX_FILE_SIZE).toBe(5_242_880);
  });
});
