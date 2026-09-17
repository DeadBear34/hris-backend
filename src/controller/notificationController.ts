import type { Request, Response, NextFunction } from "express";
import * as notificationModel from "../models/notification.js";
import { toView } from "../realtime/event.js";
import { Unauthorized, NotFound } from "../helpers/appError.js";
import { plural } from "../helpers/plural.js";
import { startActivity } from "../helpers/activityLog.js";

function requireUserId(req: Request): string {
  if (!req.user) {
    throw Unauthorized("You are not logged in, please log in first");
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
      data: rows.map(toView),
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
  const activity = startActivity(req);

  try {
    const recipient_user_id = requireUserId(req);
    const { id } = res.locals.params as { id: string };

    const updated = await notificationModel.markRead(id, recipient_user_id);

    // null berarti bukan milik dia, tidak ada, atau memang sudah dibaca.
    // Ketiganya dijawab sama supaya id orang lain tidak bisa ditebak
    if (!updated) {
      throw NotFound("Notification not found or already read");
    }

    activity.success({
      action: "notification.read",
      entity: "notification",
      entity_id: updated.id,
      summary: `Notification "${updated.title}" marked as read`,
      metadata: { type: updated.type },
    });

    res.json({
      success: true,
      message: "Notification marked as read",
      data: toView(updated),
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
  const activity = startActivity(req);

  try {
    const recipient_user_id = requireUserId(req);
    const affected = await notificationModel.markAllRead(recipient_user_id);

    activity.success({
      action: "notification.read_all",
      entity: "notification",
      summary: `${plural(affected, "notification")} marked as read`,
      metadata: { updated: affected },
    });

    res.json({
      success: true,
      message: `${plural(affected, "notification")} marked as read`,
      meta: { updated: affected, unread: 0 },
    });
  } catch (err) {
    next(err);
  }
}
