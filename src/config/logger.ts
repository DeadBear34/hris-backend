import pino from "pino";
import { env } from "./env.js";
import { createPrettyStream } from "./prettyLog.js";

// Pengujian selalu senyap. Hasil tes dibaca dari laporan Jest, dan log yang
// ikut tercetak hanya menenggelamkan pesan kegagalan yang sebenarnya
export const logLevel = env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL;

// Di development log dibaca manusia, jadi ditampilkan satu baris berwarna
// lewat prettyLog. Di production log tetap JSON utuh supaya bisa dicari dan
// disaring di dashboard Railway
export const logger =
  env.NODE_ENV === "development"
    ? pino({ level: logLevel }, createPrettyStream(env.TIMEZONE))
    : pino({ level: logLevel });
