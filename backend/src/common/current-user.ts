export type Role = "ADMIN" | "SECRETAIRE";

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
}
