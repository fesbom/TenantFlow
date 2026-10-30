// Script temporário de teste (somente leitura): lista usuários ativos e gera um token JWT.
import { db } from "../server/db";
import { users } from "../shared/schema";
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!secret) {
  console.error("JWT_SECRET/SESSION_SECRET não configurado");
  process.exit(1);
}

const all = await db
  .select({
    id: users.id,
    email: users.email,
    role: users.role,
    clinicId: users.clinicId,
    tokenVersion: users.tokenVersion,
    isActive: users.isActive,
    fullName: users.fullName,
  })
  .from(users)
  .limit(10);

console.log("USERS (read-only):");
for (const x of all) {
  console.log(`- ${x.email} | role=${x.role} | active=${x.isActive} | clinic=${x.clinicId} | tv=${x.tokenVersion}`);
}

const target = all.find((x) => x.isActive && x.clinicId) || all[0];
if (target) {
  const token = jwt.sign({ userId: target.id, tokenVersion: target.tokenVersion }, secret, { expiresIn: "1h" });
  console.log("\nTOKEN_FOR=" + target.email);
  console.log("TOKEN=" + token);
}
process.exit(0);
