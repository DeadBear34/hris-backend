import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import * as leaveRequestModel from "../models/leaveRequest.js";
import * as attachmentModel from "../models/leaveAttachment.js";
import type { LeaveRequest } from "../models/leaveRequest.js";
import { detectImageMimeType, MAX_FILE_SIZE } from "../helpers/fileType.js";
import {
  buildStoragePath,
  checksumOf,
  createSignedUrl,
  isStorageConfigured,
  uploadAttachment,
} from "../helpers/storage.js";
import {
  BadRequest,
  Forbidden,
  NotFound,
  Unauthorized,
} from "../helpers/appError.js";

async function pastikanBolehMengakses(
  req: Request,
  request: LeaveRequest,
): Promise<string> {
  if (!req.user) throw Unauthorized("Belum login");

  const employee = await employeeModel.findByUserId(req.user.id);

  if (!employee) {
    throw BadRequest(
      "Akun kamu belum terhubung ke data karyawan, hubungi HR terlebih dahulu",
    );
  }

  const isAdmin = req.user.role === "admin";

  const boleh =
    isAdmin ||
    request.employee_id === employee.id ||
    request.approver_id === employee.id;

  if (!boleh) {
    throw Forbidden("Kamu tidak punya akses ke lampiran pengajuan cuti ini");
  }

  return employee.id;
}

export async function UploadLeaveAttachmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!isStorageConfigured()) {
      throw BadRequest(
        "Penyimpanan lampiran belum dikonfigurasi, hubungi administrator",
      );
    }

    const { id } = res.locals.params as { id: string };
    const berkas = req.file;

    if (!berkas) {
      throw BadRequest("Berkas lampiran wajib diunggah pada field 'file'");
    }

    if (berkas.size > MAX_FILE_SIZE) {
      throw BadRequest("Ukuran berkas maksimal 5 MB");
    }

    const request = await leaveRequestModel.findById(id);
    if (!request) throw NotFound("Pengajuan cuti tidak ditemukan");

    const employeeId = await pastikanBolehMengakses(req, request);

    const mime = detectImageMimeType(berkas.buffer);

    if (!mime) {
      throw BadRequest(
        "Lampiran harus berupa gambar JPEG, PNG, atau WebP yang sah",
      );
    }

    const storagePath = buildStoragePath(request.id, mime);

    await uploadAttachment(storagePath, berkas.buffer, mime);

    const attachment = await attachmentModel.createAttachment({
      leave_request_id: request.id,
      storage_path: storagePath,
      file_name: berkas.originalname,
      mime_type: mime,
      file_size: berkas.size,
      checksum: checksumOf(berkas.buffer),
      uploaded_by: employeeId,
    });

    res.status(201).json({
      success: true,
      message: "Lampiran berhasil diunggah",
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
    if (!request) throw NotFound("Pengajuan cuti tidak ditemukan");

    await pastikanBolehMengakses(req, request);

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
        "Penyimpanan lampiran belum dikonfigurasi, hubungi administrator",
      );
    }

    const { id } = res.locals.params as { id: string };

    const attachment = await attachmentModel.findById(id);
    if (!attachment) throw NotFound("Lampiran tidak ditemukan");

    const request = await leaveRequestModel.findById(
      attachment.leave_request_id,
    );
    if (!request) throw NotFound("Pengajuan cuti tidak ditemukan");

    await pastikanBolehMengakses(req, request);

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
