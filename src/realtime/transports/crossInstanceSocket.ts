import { pool } from "../../config/databaseConnection.js";
import { announce } from "../crossInstance.js";
import type { Transport } from "../dispatcher.js";

// Meneruskan ke instance backend lain lewat LISTEN/NOTIFY PostgreSQL,
// supaya klien yang tersambung ke proses lain tetap kebagian
export const crossInstanceTransport: Transport = {
  name: "antar-instance",
  send(user_ids, event) {
    announce(user_ids, event, pool);
  },
};
