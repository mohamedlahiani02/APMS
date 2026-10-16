import bcrypt from "bcrypt";
import { z } from "zod";
import { config } from "../config.js";
import { prisma, closeDb } from "../db.js";
import { audit } from "../common/audit.js";

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Set APMS_ADMIN_EMAIL and APMS_ADMIN_PASSWORD, then run npm run admin:create. Creates a fresh local administrator; never resets an existing account.",
    );
    return;
  }
  const database = new URL(config.DATABASE_URL);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    database.port !== "5433"
  ) {
    throw new Error(
      "This bootstrap command is restricted to the local development database on port 5433.",
    );
  }
  const input = z
    .object({
      APMS_ADMIN_EMAIL: z.string().trim().email(),
      APMS_ADMIN_PASSWORD: z
        .string()
        .min(8)
        .max(72)
        .regex(/[A-Za-z]/)
        .regex(/[0-9]/),
    })
    .safeParse(process.env);
  if (!input.success)
    throw new Error(
      "Set a valid APMS_ADMIN_EMAIL and APMS_ADMIN_PASSWORD (8–72 characters, a letter and a digit).",
    );
  const { APMS_ADMIN_EMAIL: email, APMS_ADMIN_PASSWORD: password } = input.data;
  if (await prisma.users.findFirst({ where: { email } }))
    throw new Error(
      "An account with that email already exists; it was not modified.",
    );
  const hash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        email,
        password_hash: hash,
        role: "ADMIN",
        first_name: "Admin",
        last_name: "Local",
        is_active: true,
        must_change_password: true,
      },
    });
    await audit.logCreate(tx, {
      entityType: "USER",
      entityId: user.id,
      actor: { id: user.id, email: user.email, role: "ADMIN" },
      summary: "Création initiale d’un administrateur local",
    });
  });
  console.log(
    "Local administrator created. Change its password at first login.",
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Administrator creation failed.",
    );
    process.exitCode = 1;
  })
  .finally(closeDb);
