import {z} from "zod";

export const listEmployeeQuerySchema = z.object({
    search: z.string().trim().optional(),
    departement_id: z.string().uuid("Department tidak valid").optional(),
    is_active: z.enum(["true", "false"]).optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});