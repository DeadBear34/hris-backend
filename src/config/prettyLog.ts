const RESET = "\x1b[0m";
const GRAY = "\x1b[90m";

interface LevelStyle {
  label: string;
  color: string;
}

const LEVEL_STYLES: Record<number, LevelStyle> = {
  10: { label: "TRACE", color: "\x1b[90m" },
  20: { label: "DEBUG", color: "\x1b[34m" },
  30: { label: "INFO", color: "\x1b[32m" },
  40: { label: "WARNING", color: "\x1b[33m" },
  50: { label: "ERROR", color: "\x1b[31m" },
  60: { label: "FATAL", color: "\x1b[41m\x1b[97m" },
};

const BADGE_WIDTH = "[WARNING]".length;

const HIDDEN_KEYS = new Set([
  "level",
  "time",
  "msg",
  "pid",
  "hostname",
  "activity",
  "method",
  "path",
  "status",
  "duration_ms",
  "user_id",
]);

export interface LogRecord {
  level: number;
  time: number;
  msg?: string;
  [key: string]: unknown;
}

function paint(text: string, color: string, useColor: boolean): string {
  return useColor ? `${color}${text}${RESET}` : text;
}

export function formatTimestamp(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(at));

  const read = (type: string) => parts.find((p) => p.type === type)?.value;

  // Tengah malam dapat terbaca sebagai pukul 24 pada sebagian runtime
  const hour = String(Number(read("hour")) % 24).padStart(2, "0");

  return `${read("year")}-${read("month")}-${read("day")} ${hour}:${read("minute")}:${read("second")}`;
}

function formatBadge(level: number, useColor: boolean): string {
  const style = LEVEL_STYLES[level] ?? { label: `L${level}`, color: GRAY };
  const badge = `[${style.label}]`;

  // Spasi pengisi diletakkan di luar warna supaya hanya labelnya yang berwarna
  return (
    paint(badge, style.color, useColor) + " ".repeat(BADGE_WIDTH - badge.length)
  );
}

// pino menaruh error di kunci err, atau langsung di akar catatan bila yang
// dicatat adalah objek Error itu sendiri
function stackOf(record: LogRecord): string | null {
  const err = record.err as { stack?: unknown } | undefined;

  if (typeof err?.stack === "string") return err.stack;
  if (typeof record.stack === "string") return record.stack;

  return null;
}

export function formatLogLine(
  record: LogRecord,
  timeZone: string,
  useColor: boolean,
): string {
  const time = paint(
    `[${formatTimestamp(record.time, timeZone)}]`,
    GRAY,
    useColor,
  );
  const badge = formatBadge(record.level, useColor);
  const stack = stackOf(record);

  const extras = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) =>
        !HIDDEN_KEYS.has(key) &&
        // stack ditampilkan terpisah di bawah baris utama
        !(stack && ["err", "stack", "type", "message"].includes(key)),
    ),
  );

  const message =
    record.msg ?? (typeof record.message === "string" ? record.message : "");

  let line = `${time} ${badge} ${message}`;

  if (Object.keys(extras).length > 0) {
    line += " " + paint(JSON.stringify(extras), GRAY, useColor);
  }

  if (stack) {
    line += "\n" + paint(stack.replace(/^/gm, "    "), GRAY, useColor);
  }

  return line + "\n";
}

// Warna dimatikan bila keluaran dialihkan ke berkas, atau bila NO_COLOR
// diisi, mengikuti kesepakatan umum no-color.org
export function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;

  return Boolean(process.stdout.isTTY);
}

export function createPrettyStream(timeZone: string) {
  const useColor = shouldUseColor();

  return {
    write(chunk: string) {
      try {
        process.stdout.write(
          formatLogLine(JSON.parse(chunk) as LogRecord, timeZone, useColor),
        );
      } catch {
        // Baris yang bukan JSON diteruskan apa adanya, jangan sampai hilang
        process.stdout.write(chunk);
      }
    },
  };
}
