import { Redis } from "ioredis";
import { logger } from "./logger.js";

// Redis bersifat opsional. Backend harus tetap menyala dan melayani permintaan
// walaupun REDIS_URL tidak diisi atau Redis sedang mati, karena fitur yang
// memakainya punya jalur cadangan sendiri. Karena itu kegagalan Redis tidak
// pernah menghentikan server, hanya dicatat
export type RedisState = "disabled" | "connecting" | "ready" | "unavailable";

let client: Redis | null = null;

// Dipanggil sekali saat server menyala. Tidak ditunggu sampai tersambung,
// supaya server tetap bisa melayani permintaan selama Redis belum siap.
// Alamatnya sengaja wajib dikirim, bukan diambil otomatis dari env: nilai
// bawaan parameter membuat startRedis(undefined) diam-diam tetap menyambung
export function startRedis(url: string | undefined): Redis | null {
  if (!url) {
    logger.info("REDIS_URL is not set, features that use Redis are disabled");
    return null;
  }

  if (client) return client;

  const created = new Redis(url, {
    connectTimeout: 5_000,
    // Perintah gagal cepat alih-alih menunggu Redis kembali, dan tidak
    // ditumpuk selama koneksi terputus. Pemanggil yang memutuskan jalur
    // cadangannya, misalnya menulis langsung ke PostgreSQL
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    // Terus mencoba menyambung di latar belakang dengan jeda yang makin
    // panjang, paling lama 10 detik, sehingga Redis yang sempat mati pulih
    // sendiri tanpa server perlu dinyalakan ulang
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  });

  let warned = false;

  created.on("ready", () => {
    warned = false;
    logger.info("Redis connected");
  });

  // Tanpa pendengar ini, galat koneksi dianggap tak tertangani. Peringatan
  // hanya dicatat sekali per putusnya koneksi, bukan setiap percobaan ulang,
  // supaya log tidak dibanjiri selama Redis mati
  created.on("error", (err) => {
    if (warned) return;
    warned = true;
    // Cukup pesannya. Redis yang mati adalah keadaan yang sudah diperkirakan,
    // misalnya Docker belum dinyalakan, jadi stack trace tidak menambah apa pun
    logger.warn(
      { reason: err.message },
      "Redis unavailable, retrying in the background",
    );
  });

  client = created;

  return client;
}

// Mengembalikan klien hanya bila benar-benar siap dipakai. null berarti
// pemanggil harus memakai jalur cadangannya
export function getRedis(): Redis | null {
  return client?.status === "ready" ? client : null;
}

export function redisState(): RedisState {
  if (!client) return "disabled";

  switch (client.status) {
    case "ready":
      return "ready";
    case "wait":
    case "connecting":
    case "connect":
      return "connecting";
    default:
      return "unavailable";
  }
}

// quit menunggu perintah yang sedang berjalan selesai. Kalau Redis sudah
// tidak terjangkau, quit tidak akan pernah dijawab, jadi koneksi diputus paksa
export async function closeRedis(): Promise<void> {
  if (!client) return;

  const current = client;
  client = null;

  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
