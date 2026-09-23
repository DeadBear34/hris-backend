import type { Request, Response, NextFunction } from "express";
import * as leaveRequestModel from "../models/leaveRequest.js";
import * as attachmentModel from "../models/leaveAttachment.js";
import type { LeaveRequest } from "../models/leaveRequest.js";
import { detectImageMimeType, MAX_FILE_SIZE } from "../helpers/fileType.js";
import { hasFeature } from "../middlewares/feature.js";
import {
  buildStoragePath,
  checksumOf,
  createSignedUrl,
  isStorageConfigured,
  uploadAttachment,
} from "../helpers/storage.js";
import { BadRequest, Forbidden, NotFound } from "../helpers/appError.js";
import { requireRequestEmployee } from "../helpers/requestEmployee.js";
import { startActivity } from "../helpers/activityLog.js";

async function assertMayAccess(
  req: Request,
  res: Response,
  request: LeaveRequest,
): Promise<string> {
  const employee = await requireRequestEmployee(req, res);
  const canViewAll = await hasFeature(req, res, "leave.view_all");

  const allowed =
    canViewAll ||
    request.employee_id === employee.id ||
    request.approver_id === employee.id;

  if (!allowed) {
    throw Forbidden(
      "You don't have access to this leave request's attachments",
    );
  }

  return employee.id;
}

export async function UploadLeaveAttachmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    if (!isStorageConfigured()) {
      throw BadRequest(
        "Attachment storage is not configured, please contact an administrator",
      );
    }

    const { id } = res.locals.params as { id: string };
    const uploadedFile = req.file;

    if (!uploadedFile) {
      throw BadRequest("An attachment must be uploaded in the 'file' field");
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      throw BadRequest("File must be 5 MB or smaller");
    }

    const request = await leaveRequestModel.findById(id);
    if (!request) throw NotFound("Leave request not found");

    const employeeId = await assertMayAccess(req, res, request);

    const mime = detectImageMimeType(uploadedFile.buffer);

    if (!mime) {
      throw BadRequest("Attachment must be a valid JPEG, PNG, or WebP image");
    }

    const storagePath = buildStoragePath(request.id, mime);

    await uploadAttachment(storagePath, uploadedFile.buffer, mime);

    const attachment = await attachmentModel.createAttachment({
      leave_request_id: request.id,
      storage_path: storagePath,
      file_name: uploadedFile.originalname,
      mime_type: mime,
      file_size: uploadedFile.size,
      checksum: checksumOf(uploadedFile.buffer),
      uploaded_by: employeeId,
    });

    activity.success({
      action: "leave.attachment_upload",
      entity: "leave_attachment",
      entity_id: attachment.id,
      summary: `Evidence uploaded for leave request ${request.start_date} to ${request.end_date}`,
      metadata: {
        leave_request_id: request.id,
        file_size: uploadedFile.size,
        mime_type: mime,
      },
    });

    res.status(201).json({
      success: true,
      message: "Attachment uploaded successfully",
      data: attachment,
    });
  } catch (err) {
    next(err);
  }
}

export async function ListLeaveAttachmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const request = await leaveRequestModel.findById(id);
    if (!request) throw NotFound("Leave request not found");

    await assertMayAccess(req, res, request);

    const attachments = await attachmentModel.findByRequest(id);

    res.json({ success: true, data: attachments });
  } catch (err) {
    next(err);
  }
}

export async function SignedUrlLeaveAttachmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!isStorageConfigured()) {
      throw BadRequest(
        "Attachment storage is not configured, please contact an administrator",
      );
    }

    const { id } = res.locals.params as { id: string };

    const attachment = await attachmentModel.findById(id);
    if (!attachment) throw NotFound("Attachment not found");

    const request = await leaveRequestModel.findById(
      attachment.leave_request_id,
    );
    if (!request) throw NotFound("Leave request not found");

    await assertMayAccess(req, res, request);

    const { url, expires_in } = await createSignedUrl(attachment.storage_path);

    res.json({
      success: true,
      data: {
        id: attachment.id,
        file_name: attachment.file_name,
        mime_type: attachment.mime_type,
        url,
        expires_in,
      },
    });
  } catch (err) {
    next(err);
  }
}
