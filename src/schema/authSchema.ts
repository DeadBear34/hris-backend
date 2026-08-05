import {email, z} from "zod";

export const registerSchema = z.object({
    email: z
    .string({ message: "Email wajib diisi"})
    .trim()
    .toLowerCase()
    .min(1, "Email wajib diisi")
    .email("Format email tidak valid"),

    password: z
    .string({message: "Password wajib diisi"})
    .min(8, "Password minimal 8 karakter")
    .max(72, "Password maximal 72 karakter"),
});

export const loginSchema = z.object({
    email: z
    .string({ message: "Email wajib diisi" })
    .trim()
    .toLowerCase()
    .min(1, "Email wajib diisi")
    .email("Format email tidak valid"),

    password: z
    .string({ message: "Password wajib diisi" })
    .min(1, "Password wajib diisi"),
});