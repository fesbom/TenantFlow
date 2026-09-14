import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Idle connections can be closed by the database service. The pool removes
// failed clients; handling this event prevents an unrelated process crash.
pool.on("error", () => {
  console.error("[database] Idle connection closed unexpectedly; pool will replace it.");
});
export const db = drizzle({ client: pool, schema });