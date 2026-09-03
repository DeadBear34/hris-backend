import type { Request, Response, NextFunction } from "express";
import * as notificationModel from "../models/notification.js";
import { Unauthorized, NotFound } from "../helpers/appError.js";

// Bentuk yang dipakai frontend: id, type, title, message, is_read,
// created_at, link. Kolom internal seperti recipient_user_id tidak ikut
function toResponse(row: notificationModel.Notification) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    is_read: row.is_read,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");
  }

  return req.user.id;
}

export async function ListNotificationController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const recipient_user_id = requireUserId(req);
    const { only_unread, page, limit } = res.locals.query as {
      only_unread?: boolean;
      page: number;
      limit: number;
    };

    const { rows, total, unread } = await notificationModel.listFor({
      recipient_user_id,
      only_unread: only_unread ?? false,
      page,
      limit,
    });

    res.json({
      success: true,
      data: rows.map(toResponse),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
        // dipakai lencana di lonceng, tidak terpengaruh pagination
        unread,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function MarkNotificationReadController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const recipient_user_id = requireUserId(req);
    const { id } = res.locals.params as { id: string };

    const updated = await notificationModel.markRead(id, recipient_user_id);

    // null berarti bukan milik dia, tidak ada, atau memang sudah dibaca.
    // Ketiganya dijawab sama supaya id orang lain tidak bisa ditebak
    if (!updated) {
      throw NotFound("Notifikasi tidak ditemukan atau sudah dibaca");
    }

    res.json({
      success: true,
      message: "Notifikasi ditandai sudah dibaca",
      data: toResponse(updated),
      meta: { unread: await notificationModel.countUnread(recipient_user_id) },
    });
  } catch (err) {
    next(err);
  }
}

export async function MarkAllNotificationReadController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const recipient_user_id = requireUserId(req);
    const affected = await notificationModel.markAllRead(recipient_user_id);

    res.json({
      success: true,
      message: `${affected} notifikasi ditandai sudah dibaca`,
      meta: { updated: affected, unread: 0 },
    });
  } catch (err) {
    next(err);
  }
}
