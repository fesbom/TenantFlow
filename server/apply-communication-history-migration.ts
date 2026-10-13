import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  currentDirectory,
  "..",
  "migrations",
  "0013_communication_history_metadata.sql",
);

async function applyMigration(): Promise<void> {
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  await db.transaction(async (transaction) => {
    await transaction.execute(sql.raw(migrationSql));
  });
  console.log("[MIGRATION] 0013_communication_history_metadata.sql aplicada com sucesso.");
}

applyMigration()
  .catch((error: unknown) => {
    console.error("[MIGRATION] Falha ao aplicar 0013_communication_history_metadata.sql:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
