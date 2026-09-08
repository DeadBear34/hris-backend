import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { topicFor, realtimeEnabled } from "../helpers/realtimeToken.js";

// Diterbitkan sebagai pesan privat, jadi hanya klien yang lolos kebijakan
// RLS di realtime.messages yang bisa membacanya
const MAX_MESSAGES_PER_REQUEST = 100;

interface OutgoingMessage {
  topic: string;
  event: string;
  payload: unknown;
  private: true;
}

async function postBatch(messages: OutgoingMessage[]): Promise<void> {
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

// Isi lengkap notifikasi ikut dikirim. Aman karena kanalnya privat dan
// dijaga kebijakan RLS, bukan sekadar nama yang sulit ditebak
export function publish(
  user_ids: string[],
  event: string,
  payload: unknown,
): void {
  if (!realtimeEnabled()) return;

  const unique = [...new Set(user_ids)];
  if (unique.length === 0) return;

  const messages: OutgoingMessage[] = unique.map((user_id) => ({
    topic: topicFor(user_id),
    event,
    payload,
    private: true,
  }));

  void (async () => {
    try {
      for (let i = 0; i < messages.length; i += MAX_MESSAGES_PER_REQUEST) {
        await postBatch(messages.slice(i, i + MAX_MESSAGES_PER_REQUEST));
      }
    } catch (err) {
      logger.error(
        { err, event, recipients: unique.length },
        "Gagal menerbitkan ke Supabase Realtime",
      );
    }
  })();
}
