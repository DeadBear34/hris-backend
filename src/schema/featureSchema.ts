import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";

export const replacePositionFeaturesSchema = z.object({
  codes: z
    .array(
      z
        .string({ message: "Feature code must be text" })
        .trim()
        .min(1, "Feature code cannot be empty")
        .max(60, "Feature code must be at most 60 characters"),
      { message: "Feature code list is required" },
    )
    .max(200, "Too many feature codes in one request"),
  updated_at: expectedUpdatedAt,
});
