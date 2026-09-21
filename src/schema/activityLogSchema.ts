import { z } from "zod";

export const listActivityLogQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(60).optional(),
    status: z
      .enum(["success", "failed"], { message: "Unknown activity status" })
      .optional(),
    entity: z.string().trim().min(1).max(60).optional(),
    entity_id: z.uuid("Invalid entity ID").optional(),
    actor_user_id: z.uuid("Invalid actor ID").optional(),
    start_date: z.iso.date("Invalid start date").optional(),
    end_date: z.iso.date("Invalid end date").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.end_date >= data.start_date,
    { message: "End date cannot be before start date", path: ["end_date"] },
  );
