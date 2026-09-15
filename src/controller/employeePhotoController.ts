import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import type { Employee } from "../models/employee.js";
import { detectImageMimeType, MAX_FILE_SIZE } from "../helpers/fileType.js";
import { logger } from "../config/logger.js";
import {
  buildPhotoPath,
  deletePhoto,
  isStorageConfigured,
  photoUrlFor,
  uploadPhoto,
} from "../helpers/storage.js";
import { BadRequest, NotFound, Unauthorized } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";

async function requesterEmployee(req: Request): Promise<Employee> {
  if (!req.user) {
    throw Unauthorized("You are not logged in, please log in first");
  }

  const employee = await employeeModel.findByUserId(req.user.id);

  if (!employee) {
    throw BadRequest(
      "Your account is not linked to an employee record yet, please contact an admin first",
    );
  }

  return employee;
}

async function targetEmployee(id: string): Promise<Employee> {
  const employee = await employeeModel.findById(id);

  if (!employee) throw NotFound("Employee not found");

  return employee;
}

function assertStorageReady(): void {
  if (!isStorageConfigured()) {
    throw BadRequest(
      "Profile photo storage is not configured, please contact an administrator",
    );
  }
}

async function discardOldPhoto(storagePath: string | null): Promise<void> {
  if (!storagePath) return;

  try {
    await deletePhoto(storagePath);
  } catch (err) {
    logger.warn(
      { err, storagePath },
      "Failed to delete the old profile photo from storage",
    );
  }
}

async function replacePhoto(
  employee: Employee,
  berkas: Express.Multer.File | undefined,
) {
  assertStorageReady();

  if (!berkas) {
    throw BadRequest("A profile photo must be uploaded in the 'photo' field");
  }

  if (berkas.size > MAX_FILE_SIZE) {
    throw BadRequest("Profile photo must be 5 MB or smaller");
  }

  const mime = detectImageMimeType(berkas.buffer);

  if (!mime) {
    throw BadRequest("Profile photo must be a valid JPEG, PNG, or WebP image");
  }

  const storagePath = buildPhotoPath(employee.id, mime);

  await uploadPhoto(storagePath, berkas.buffer, mime);

  const updated = await employeeModel.updatePhotoPath(employee.id, storagePath);

  if (!updated) {
    await discardOldPhoto(storagePath);
    throw NotFound("Employee not found");
  }

  await discardOldPhoto(employee.photo_path);

  return {
    employee_id: updated.id,
    photo_path: updated.photo_path,
    photo_url: photoUrlFor(updated.photo_path),
  };
}

async function removePhoto(employee: Employee) {
  if (!employee.photo_path) {
    throw BadRequest("This employee has no profile photo");
  }

  assertStorageReady();

  await employeeModel.updatePhotoPath(employee.id, null);
  await discardOldPhoto(employee.photo_path);
}

export async function UploadOwnPhotoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await requesterEmployee(req);
    const data = await replacePhoto(employee, req.file);

    res.json({
      success: true,
      message: "Profile photo updated successfully",
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function DeleteOwnPhotoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await requesterEmployee(req);
    await removePhoto(employee);

    res.json({ success: true, message: "Profile photo deleted successfully" });
  } catch (err) {
    next(err);
  }
}

export async function UploadEmployeePhotoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const activity = startActivity(req);
    const employee = await targetEmployee(id);
    const data = await replacePhoto(employee, req.file);

    activity.success({
      action: "employee.photo_upload",
      entity: "employee",
      entity_id: employee.id,
      summary: `Profile photo for ${employee.full_name} updated`,
    });

    res.json({
      success: true,
      message: `Profile photo for ${employee.full_name} updated successfully`,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function DeleteEmployeePhotoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const activity = startActivity(req);
    const employee = await targetEmployee(id);
    await removePhoto(employee);

    activity.success({
      action: "employee.photo_delete",
      entity: "employee",
      entity_id: employee.id,
      summary: `Profile photo for ${employee.full_name} deleted`,
    });

    res.json({
      success: true,
      message: `Profile photo for ${employee.full_name} deleted successfully`,
    });
  } catch (err) {
    next(err);
  }
}
