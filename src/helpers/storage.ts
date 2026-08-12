import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import type { AllowedMimeType } from "./fileType.js";
import { extensionFor } from "./fileType.js";

const SIGNED_URL_BERLAKU_DETIK = 15 * 60;

let client: SupabaseClient | null = null;

function ambilClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diatur, penyimpanan lampiran tidak tersedia",
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

export function buildStoragePath(
  leaveRequestId: string,
  mime: AllowedMimeType,
): string {
  return `${leaveRequestId}/${crypto.randomUUID()}.${extensionFor(mime)}`;
}

export function checksumOf(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function uploadAttachment(
  storagePath: string,
  buffer: Buffer,
  contentType: AllowedMimeType,
): Promise<void> {
  const { error } = await ambilClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false });

  if (error) {
    throw new Error(`Gagal mengunggah lampiran: ${error.message}`);
  }
}

export async function createSignedUrl(storagePath: string): Promise<{
  url: string;
  expires_in: number;
}> {
  const { data, error } = await ambilClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_BERLAKU_DETIK);

  if (error || !data) {
    throw new Error(
      `Gagal membuat tautan lampiran: ${error?.message ?? "tidak diketahui"}`,
    );
  }

  return { url: data.signedUrl, expires_in: SIGNED_URL_BERLAKU_DETIK };
}
