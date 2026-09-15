import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string({ message: "Email is required" })
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Invalid email format, example: name@domain.com"),

  password: z
    .string({ message: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),

  full_name: z
    .string({ message: "Full name is required" })
    .trim()
    .min(3, "Full name must be at least 3 characters")
    .max(150, "Full name must be at most 150 characters"),

  phone: z
    .string({ message: "Phone number is required" })
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Phone number must start with a country code, example: +628123456789",
    ),

  gender: z.enum(["male", "female"], {
    message: "Gender is required",
  }),

  terms_accepted: z.literal(true, {
    message: "You must accept the terms and conditions",
  }),
});

export const loginSchema = z.object({
  email: z
    .string({ message: "Email is required" })
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Invalid email format"),

  password: z
    .string({ message: "Password is required" })
    .min(1, "Password is required"),
});

export const changePasswordSchema = z
  .object({
    current_password: z
      .string({ message: "Current password is required" })
      .min(1, "Current password is required"),

    new_password: z
      .string({ message: "New password is required" })
      .min(8, "New password must be at least 8 characters")
      .max(72, "New password must be at most 72 characters"),
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "New password must be different from the current password",
    path: ["new_password"],
  });

export const setUserActiveSchema = z.object({
  is_active: z.boolean({ message: "Active status is required" }),
});

const emailField = z
  .string({ message: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .pipe(z.email("Invalid email format, example: name@domain.com"));

export const verifyEmailSchema = z.object({
  email: emailField,

  code: z
    .string({ message: "Verification code is required" })
    .trim()
    .regex(/^\d{6}$/, "Verification code must be 6 digits"),
});

export const resendVerificationSchema = z.object({
  email: emailField,
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    email: emailField,

    token: z
      .string({ message: "Token is required" })
      .trim()
      .min(1, "Token is required"),

    password: z
      .string({ message: "New password is required" })
      .min(8, "New password must be at least 8 characters")
      .max(72, "New password must be at most 72 characters"),

    password_confirmation: z.string({
      message: "Password confirmation is required",
    }),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Password confirmation does not match the new password",
    path: ["password_confirmation"],
  });
