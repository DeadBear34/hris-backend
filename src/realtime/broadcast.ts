import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { channelFor, realtimeEnabled } from "../helpers/notificationChannel.js";

// Isi notifikasi TIDAK PERNAH lewat sini. Yang dikirim hanya isyarat
// "ada perubahan, ambil sendiri", lalu klien memanggil GET /notifications
// dengan token miliknya. Jadi seandainya nama kanal bocor, yang bisa
// diketahui hanya kapan seseorang menerima notifikasi, bukan isinya
const SIGNAL_EVENT = "refresh";

// Batas aman satu permintaan; siaran ke banyak penerima dipecah per potongan
const MAX_MESSAGES_PER_REQUEST = 100;

interface BroadcastMessage {
  topic: string;
  event: string;
  payload: Record<string, never>;
}

async function postBatch(messages: BroadcastMessage[]): Promise<void> {
  const response = await fetch(
    `${env.SUPABASE_URL}/realtime/v1/api/broadcast`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase menolak siaran dengan status ${response.status}`);
  }
}

// Tidak ditunggu pemanggilnya. Siaran adalah pelengkap: kalau gagal,
// notifikasinya tetap tersimpan di database dan terbaca lewat polling
export function signalUsers(user_ids: string[]): void {
  if (!realtimeEnabled()) return;

  const topics = [...new Set(user_ids)]
    .map(channelFor)
    .filter((topic): topic is string => topic !== null);

  if (topics.length === 0) return;

  const messages: BroadcastMessage[] = topics.map((topic) => ({
    topic,
    event: SIGNAL_EVENT,
    payload: {},
  }));

  void (async () => {
    try {
      for (let i = 0; i < messages.length; i += MAX_MESSAGES_PER_REQUEST) {
        await postBatch(messages.slice(i, i + MAX_MESSAGES_PER_REQUEST));
      }
    } catch (err) {
      logger.error(
        { err, recipients: topics.length },
        "Gagal menyiarkan isyarat notifikasi",
      );
    }
  })();
}
