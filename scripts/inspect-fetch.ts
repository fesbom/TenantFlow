// Inspeciona o fetchWithAuth (Xf) no bundle byte a byte
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../dist/public/assets");
const jsFile = fs.readdirSync(assetsDir).filter((f) => f.endsWith(".js")).sort().pop()!;
const content = fs.readFileSync(path.join(assetsDir, jsFile), "utf8");

// fetchWithAuth do print-schedule: const Xf=async e=>{const t=await fetch(e,{headers:{Authorization:...
const idx = content.indexOf("const Xf=async");
console.log("=== Xf (fetchWithAuth) byte a byte ===");
const snippet = content.substring(idx, idx + 200);
console.log("texto:", snippet);
console.log("\n=== codigos dos chars ao redor de 'Bearer' ===");
const bIdx = content.indexOf("Bearer", idx);
for (let i = bIdx - 3; i < bIdx + 60; i++) {
  const ch = content[i];
  const code = content.charCodeAt(i);
  console.log(`  [${i}] '${ch}' = ${code}${code === 96 ? " <BACKTICK>" : code === 39 ? " <ASPAS-SIMPLES>" : code === 34 ? " <ASPAS-DUPLAS>" : code === 36 ? " <DOLLAR>" : code === 123 ? " <OPEN-BRACE>" : ""}`);
}
process.exit(0);
