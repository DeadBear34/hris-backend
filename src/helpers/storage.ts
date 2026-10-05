import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import type { AllowedMimeType } from "./fileType.js";
import { extensionFor } from "./fileType.js";
import { fileDateTimeOf, monthFolderOf } from "./timezone.js";

const SIGNED_URL_TTL_SECONDS = 15 * 60;

const MAX_BASE_NAME_LENGTH = 80;

// Berapa kali nama dicoba ulang dengan akhiran _2, _3, dan seterusnya bila
// sudah ada berkas bernama sama pada detik yang sama
const MAX_NAME_ATTEMPTS = 5;

let client: SupabaseClient | null = null;

function getStorageClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set, attachment storage is unavailable",
    );
  }

  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  return client;
}

export function isStorageConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

// Multer membaca nama berkas sebagai latin1, padahal peramban mengirimnya
// dalam UTF-8. Akibatnya "fotó.jpg" tiba sebagai "fotÃ³.jpg". Nama dibaca
// ulang sebagai UTF-8 hanya bila seluruh karakternya memang berada di rentang
// latin1 dan hasilnya teks yang sah, supaya nama yang sudah benar tidak rusak
function decodeUploadName(name: string): string {
  if (!/^[\u0000-ÿ]*$/.test(name)) return name;

  const decoded = Buffer.from(name, "latin1").toString("utf8");

  return decoded.includes("�") ? name : decoded;
}

// Nama asli dipertahankan sedekat mungkin, tetapi dibersihkan karena berasal
// dari pengguna:
// - folder dan ekstensi asli dibuang; ekstensi diganti sesuai isi berkas,
//   sehingga berkas yang namanya diubah menjadi .jpg tidak menipu
// - huruf beraksen diubah ke huruf dasarnya, spasi menjadi tanda hubung, dan
//   karakter selain huruf, angka, titik, tanda hubung, dan garis bawah dibuang,
//   supaya "../" tidak dapat keluar dari folder dan URL publiknya tetap bersih
// - dibatasi panjangnya, dan diganti nama cadangan bila tidak tersisa apa pun
export function baseNameOf(
  originalName: string | undefined,
  fallback: string,
): string {
  const lastSegment = decodeUploadName(originalName ?? "")
    .split(/[\\/]/)
    .pop()!;

  const withoutExtension = lastSegment.replace(/\.[^.]*$/, "");

  const cleaned = withoutExtension
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/([-_.])\1+/g, "$1")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, MAX_BASE_NAME_LENGTH)
    .replace(/[-_.]+$/g, "");

  return cleaned || fallback;
}

// Bentuk nama berkas: <nama asli>_<tanggal-bulan-tahun>_<jam-menit-detik>
// diikuti _2, _3, dan seterusnya hanya bila nama itu sudah terpakai
function fileNameFor(
  originalName: string | undefined,
  fallback: string,
  mime: AllowedMimeType,
  attempt: number,
  at: Date,
): string {
  const counter = attempt > 1 ? `_${attempt}` : "";

  return `${baseNameOf(originalName, fallback)}_${fileDateTimeOf(at)}${counter}.${extensionFor(mime)}`;
}

// Lampiran cuti adalah berkas kejadian yang terus menumpuk, jadi diarsipkan
// per bulan agar mudah ditelusuri dan dibersihkan per periode. Pemiliknya
// tetap tercatat di database, bukan di nama berkas
export function buildStoragePath(
  originalName: string | undefined,
  mime: AllowedMimeType,
  attempt = 1,
  at: Date = new Date(),
): string {
  return `${monthFolderOf(at)}/${fileNameFor(originalName, "lampiran", mime, attempt, at)}`;
}

function isAlreadyExists(error: { message?: string }): boolean {
  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return (
    String(statusCode) === "409" || /already exists/i.test(error.message ?? "")
  );
}

// Unggahan memakai upsert: false supaya berkas orang lain tidak pernah
// tertimpa. Bila namanya sudah ada, misalnya dua orang mengunggah
// IMG_0001.jpg pada detik yang sama, nama dicoba ulang dengan akhiran angka.
// Mengembalikan jalur yang benar-benar dipakai
async function uploadUnique(
  bucket: string,
  pathFor: (attempt: number) => string,
  buffer: Buffer,
  contentType: AllowedMimeType,
  label: string,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt++) {
    const storagePath = pathFor(attempt);

    const { error } = await getStorageClient()
      .storage.from(bucket)
      .upload(storagePath, buffer, { contentType, upsert: false });

    if (!error) return storagePath;

    if (!isAlreadyExists(error)) {
      throw new Error(`Failed to upload ${label}: ${error.message}`);
    }
  }

  throw new Error(
    `Failed to upload ${label}: no free file name after ${MAX_NAME_ATTEMPTS} attempts`,
  );
}

export function checksumOf(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function uploadAttachment(
  originalName: string | undefined,
  buffer: Buffer,
  contentType: AllowedMimeType,
): Promise<string> {
  // Satu waktu dipakai untuk semua percobaan, supaya _2 dan _3 tetap
  // menunjuk detik unggahan yang sama
  const at = new Date();

  return uploadUnique(
    env.SUPABASE_STORAGE_BUCKET,
    (attempt) => buildStoragePath(originalName, contentType, attempt, at),
    buffer,
    contentType,
    "attachment",
  );
}

// Dipanggil sekali untuk banyak berkas sekaligus, bukan satu per satu, karena
// satu pengajuan cuti dapat memiliki beberapa lampiran
export async function deleteAttachments(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;

  const { error } = await getStorageClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .remove(storagePaths);

  if (error) {
    throw new Error(`Failed to delete attachments: ${error.message}`);
  }
}

export async function createSignedUrl(storagePath: string): Promise<{
  url: string;
  expires_in: number;
}> {
  const { data, error } = await getStorageClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(
      `Failed to create attachment link: ${error?.message ?? "unknown"}`,
    );
  }

  return { url: data.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS };
}

// Foto profil ikut diarsipkan per bulan, sehingga membuka satu folder bulan
// langsung memperlihatkan foto-foto yang diunggah pada bulan itu. Pemiliknya
// tetap tercatat di kolom photo_path karyawan
export function buildPhotoPath(
  originalName: string | undefined,
  mime: AllowedMimeType,
  attempt = 1,
  at: Date = new Date(),
): string {
  return `${monthFolderOf(at)}/${fileNameFor(originalName, "foto", mime, attempt, at)}`;
}

export async function uploadPhoto(
  originalName: string | undefined,
  buffer: Buffer,
  contentType: AllowedMimeType,
): Promise<string> {
  const at = new Date();

  return uploadUnique(
    env.SUPABASE_PHOTO_BUCKET,
    (attempt) => buildPhotoPath(originalName, contentType, attempt, at),
    buffer,
    contentType,
    "profile photo",
  );
}

export async function deletePhoto(storagePath: string): Promise<void> {
  const { error } = await getStorageClient()
    .storage.from(env.SUPABASE_PHOTO_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete profile photo: ${error.message}`);
  }
}

export function photoUrlFor(storagePath: string | null): string | null {
  if (!storagePath || !isStorageConfigured()) return null;

  const { data } = getStorageClient()
    .storage.from(env.SUPABASE_PHOTO_BUCKET)
    .getPublicUrl(storagePath);

  return data.publicUrl;
}
