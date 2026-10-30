// Script temporário: verifica se o token gerado é validado pelo segredo do .env
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
console.log("JWT_SECRET set?", !!process.env.JWT_SECRET);
console.log("SESSION_SECRET set?", !!process.env.SESSION_SECRET);
console.log("secret length:", secret?.length);

const [u] = await db.select().from(users).where(eq(users.email, "teste@gmail.com")).limit(1);
console.log("user tokenVersion no banco:", u.tokenVersion, "| isActive:", u.isActive);

const token = jwt.sign({ userId: u.id, tokenVersion: u.tokenVersion }, secret!, { expiresIn: "1h" });
console.log("\ntoken gerado, verificando...");
try {
  const decoded = jwt.verify(token, secret!) as any;
  console.log("VERIFY OK:", JSON.stringify(decoded));
  console.log("tokenVersion bate?", decoded.tokenVersion === u.tokenVersion);
} catch (e: any) {
  console.log("VERIFY FALHOU:", e.message);
}
process.exit(0);
