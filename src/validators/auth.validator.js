import { z } from 'zod';


const emailSchema = z.string()
  .trim()
  .toLowerCase()
  .min(5, "Email is too short")
  .max(255, "Email is too long")
  .email("Please provide a valid email address (e.g., name@example.com)");

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password is too long")
  .regex(/[A-Z]/, "Include at least one uppercase letter (A-Z)")
  .regex(/[a-z]/, "Include at least one lowercase letter (a-z)")
  .regex(/[0-9]/, "Include at least one number (0-9)")
  .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, "Include at least one special character (!@#$%^&*)");

const usernameSchema = z.string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(50, "Username cannot exceed 50 characters")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, underscores, dots, and hyphens");


export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password")
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required")
});


export const forgotPasswordSchema = z.object({
  email: emailSchema
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Invalid reset token"),
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password")
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});


export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  email: emailSchema.optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be updated"
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
  confirmNewPassword: z.string().min(1, "Please confirm your new password")
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords do not match",
  path: ["confirmNewPassword"]
});

export const changeEmailSchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(1, "Password is required to change email")
});


export const validate = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = (result.error.issues || result.error.errors).map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    return { success: false, errors };
  }
  return { success: true, data: result.data };
};
