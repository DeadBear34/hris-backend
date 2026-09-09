import { pushToMany } from "../hub.js";
import type { Transport } from "../dispatcher.js";

// Soket yang menempel di instance ini. Paling cepat, tapi hanya menjangkau
// klien yang kebetulan tersambung ke proses yang sama
export const localSocketTransport: Transport = {
  name: "soket-lokal",
  send(user_ids, event) {
    pushToMany(user_ids, event);
  },
};
