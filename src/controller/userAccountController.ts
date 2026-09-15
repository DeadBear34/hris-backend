import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import { sendMail } from "../helpers/mailer.js";
import { sendMailWithoutFailing } from "../helpers/notification.js";
import { accountApprovedEmail } from "../helpers/emailTemplate.js";
import { Unauthorized, NotFound, BadRequest } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { clearAccountApproval } from "../helpers/notify.js";

export async function ListPendingUserController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const users = await userModel.findPending();

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

export async function ApproveUserController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user)
      throw Unauthorized("You are not logged in, please log in first");

    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await userModel.findById(id);
    if (!existing) throw NotFound("User not found");

    if (existing.approved_at) {
      throw BadRequest("This account has already been approved");
    }

    const user = await userModel.approveUser(id, req.user.id);

    const employee = await employeeModel.findByUserId(id);
    const body = accountApprovedEmail(
      `${env.APP_URL}/login`,
      employee?.full_name ?? null,
    );

    await sendMailWithoutFailing(
      () =>
        sendMail({
          to: existing.email,
          subject: body.subject,
          html: body.html,
        }),
      "Failed to send account approval email",
      { email: existing.email },
    );

    // antrean notifikasi dibersihkan supaya penyetuju lain tidak melihat
    // permintaan yang sudah ditindak
    clearAccountApproval(id);

    activity.success({
      action: "user.approve",
      entity: "user",
      entity_id: id,
      summary: `Registration for ${existing.email} approved`,
    });

    res.json({
      success: true,
      message: "Account approved and ready to use",
      data: {
        id: user?.id,
        email: user?.email,
        role: user?.role,
        is_active: user?.is_active,
        approved_at: user?.approved_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function SetUserActiveController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user)
      throw Unauthorized("You are not logged in, please log in first");

    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { is_active } = req.body as { is_active: boolean };

    if (id === req.user.id) {
      throw BadRequest("You cannot change your own account status");
    }

    const existing = await userModel.findById(id);
    if (!existing) throw NotFound("User not found");

    if (!existing.approved_at && is_active) {
      throw BadRequest(
        "This account has never been approved, use the approval endpoint first",
      );
    }

    const user = await userModel.setUserActive(id, is_active);

    activity.success({
      action: "user.set_active",
      entity: "user",
      entity_id: id,
      summary: `Account ${existing.email} ${is_active ? "activated" : "deactivated"}`,
      metadata: { is_active },
    });

    res.json({
      success: true,
      message: is_active
        ? "Account activated successfully"
        : "Account deactivated successfully",
      data: {
        id: user?.id,
        email: user?.email,
        is_active: user?.is_active,
      },
    });
  } catch (err) {
    next(err);
  }
}
