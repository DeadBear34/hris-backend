import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordActivity } from "./activityLog.js";
import {
  closeDay,
  dayClosingSummary,
  type DayClosingResult,
} from "./dayClosing.js";
import {
  dateRange,
  shiftDate,
  todayInOfficeZone,
  type IsoDate,
} from "./timezone.js";

// Cukup rapat supaya tanda tidak hadir muncul tidak lama setelah batas absen
// masuk lewat, tetapi tetap ringan karena tiap putaran hanya membaca dua hari
const INTERVAL_MS = 15 * 60 * 1000;

const SYSTEM_CONTEXT = {
  actor_user_id: null,
  actor_email: null,
  ip_address: null,
  user_agent: null,
};

export function autoCloseEnabled(): boolean {
  return env.ATTENDANCE_AUTO_CLOSE === undefined
    ? env.NODE_ENV !== "test"
    : env.ATTENDANCE_AUTO_CLOSE === "true";
}

// Hari ini beserta beberapa hari sebelumnya, urut dari yang terlama
export function datesToClose(today: IsoDate, daysBack: number): IsoDate[] {
  return dateRange(shiftDate(today, -daysBack), today);
}

let running = false;

// Tiap tanggal ditutup sendiri-sendiri, jadi satu tanggal yang gagal tidak
// menghentikan tanggal lainnya. Putaran yang datang saat putaran sebelumnya
// masih berjalan dilewati supaya tidak saling tumpuk
export async function runDayClosing(
  dates: IsoDate[],
  now: Date = new Date(),
): Promise<DayClosingResult[]> {
  if (running) return [];
  running = true;

  const results: DayClosingResult[] = [];

  try {
    for (const date of dates) {
      try {
        const result = await closeDay(date, now);
        results.push(result);

        // putaran yang tidak membuat baris apa pun tidak perlu dicatat,
        // kalau tidak log aktivitas penuh catatan kosong tiap 15 menit
        if (result.created > 0) {
          recordActivity({
            action: "attendance.close_day",
            status: "success",
            context: SYSTEM_CONTEXT,
            actor_name: "System",
            entity: "attendance",
            summary: dayClosingSummary(result),
            metadata: { ...result, trigger: "scheduler" },
            occurred_at: now,
          });
        }
      } catch (err) {
        logger.error({ err, date }, "Automatic day closing failed");
      }
    }
  } finally {
    running = false;
  }

  return results;
}

// Saat menyala, hari-hari yang terlewat ikut ditutup. Sesudahnya cukup
// kemarin dan hari ini: kemarin untuk berjaga kalau putaran terakhir sebelum
// tengah malam terlewat. Aman berjalan di beberapa instance sekaligus karena
// baris yang sudah ada tidak pernah ditimpa
export function startDayClosing(): NodeJS.Timeout | null {
  if (!autoCloseEnabled()) return null;

  void runDayClosing(
    datesToClose(todayInOfficeZone(), env.ATTENDANCE_BACKFILL_DAYS),
  );

  const timer = setInterval(
    () => void runDayClosing(datesToClose(todayInOfficeZone(), 1)),
    INTERVAL_MS,
  );

  // tidak boleh menahan proses tetap hidup saat server dimatikan
  timer.unref();

  return timer;
}
