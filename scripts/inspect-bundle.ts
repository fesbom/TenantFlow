// Inspeciona o bundle procurando template literals nao interpoladas no header Authorization
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../dist/public/assets");
const jsFile = fs.readdirSync(assetsDir).filter((f) => f.endsWith(".js")).sort().pop()!;
const content = fs.readFileSync(path.join(assetsDir, jsFile), "utf8");
console.log("bundle:", jsFile, "len:", content.length);

// Procura o padrao LITERAL: Bearer ${localStorage (dollar+brace como texto, nao interpolado)
const literal = 'Bearer ${localStorage';
let idx = content.indexOf(literal);
console.log("\n=== ocorrencias de 'Bearer ${localStorage' LITERAL ===");
let count = 0;
while (idx >= 0) {
  count++;
  const start = Math.max(0, idx - 100);
  console.log(`\n[idx ${idx}] ...${content.substring(start, idx + 80)}...`);
  idx = content.indexOf(literal, idx + 1);
}
console.log("total LITERAL:", count);

// Verifica o char antes de 'Bearer': backtick (interpola) ou aspas (literal)
console.log("\n=== char antes de cada 'Bearer $' ===");
let i2 = content.indexOf("Bearer $");
while (i2 >= 0) {
  const before = content[i2 - 1];
  const beforeCode = content.charCodeAt(i2 - 1);
  console.log(`idx ${i2}: char antes='${before}' (code ${beforeCode}) ${beforeCode === 96 ? "<- BACKTICK ok" : beforeCode === 39 ? "<- ASPAS SIMPLES = BUG" : beforeCode === 34 ? "<- ASPAS DUPLAS = BUG" : ""}`);
  i2 = content.indexOf("Bearer $", i2 + 1);
}
process.exit(0);
