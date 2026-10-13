import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(currentDirectory, "..", "migrations", "0014_ai_patient_intake.sql");

async function applyMigration(): Promise<void> {
  await db.transaction(async (transaction) => {
    await transaction.execute(sql.raw(fs.readFileSync(migrationPath, "utf8")));
  });
  console.log("[MIGRATION] 0014_ai_patient_intake.sql aplicada com sucesso.");
}

applyMigration()
  .catch((error: unknown) => {
    console.error("[MIGRATION] Falha ao aplicar 0014_ai_patient_intake.sql:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
