import {z} from "zod";

export const listEmployeeQuerySchema = z.object({
    search: z.string().trim().optional(),
    department_id: z.uuid("Department tidak valid").optional(),
    is_active: z.enum(["true", "false"]).optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});