import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";

const featureCodes = z
  .array(
    z
      .string({ message: "Feature code must be text" })
      .trim()
      .min(1, "Feature code cannot be empty")
      .max(60, "Feature code must be at most 60 characters"),
    { message: "Feature code list is required" },
  )
  .max(100, "Too many feature codes in one request");

const profileName = z
  .string({ message: "Access profile name is required" })
  .trim()
  .min(3, "Access profile name must be at least 3 characters")
  .max(100, "Access profile name must be at most 100 characters");

const profileDescription = z
  .string()
  .trim()
  .max(300, "Description must be at most 300 characters")
  .nullish();

export const createAccessProfileSchema = z.object({
  name: profileName,
  description: profileDescription,
  codes: featureCodes,
});

export const updateAccessProfileSchema = z.object({
  name: profileName.optional(),
  description: profileDescription,
  codes: featureCodes.optional(),
  updated_at: expectedUpdatedAt,
});

export const assignAccessProfileSchema = z.object({
  // null berarti jabatan tanpa paket: hanya akses swalayan karyawan
  access_profile_id: z.uuid("Invalid access profile").nullable(),
  updated_at: expectedUpdatedAt,
});
