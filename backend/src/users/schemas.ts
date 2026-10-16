import { z } from "zod";

export const roleSchema = z.enum(["ADMIN", "SECRETAIRE"]);

export const createUserSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: roleSchema,
  password: z.string().min(8),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  email: z.string().trim().email().optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdParamsSchema = z.object({
  id: z.string().uuid(),
});
