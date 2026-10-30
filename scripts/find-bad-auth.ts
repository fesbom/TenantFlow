// Encontra fetches no bundle com Authorization em aspas simples (nao interpolam = BUG)
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../dist/public/assets");
const jsFile = fs.readdirSync(assetsDir).filter((f) => f.endsWith(".js")).sort().pop()!;
const content = fs.readFileSync(path.join(assetsDir, jsFile), "utf8");
console.log("bundle:", jsFile);

// Procura Authorization:'Bearer ${ (aspas simples = NAO interpola = BUG)
const bad = "Authorization:'Bearer";
let idx = content.indexOf(bad);
let count = 0;
const locations: number[] = [];
while (idx >= 0) {
  count++;
  locations.push(idx);
  idx = content.indexOf(bad, idx + 1);
}
console.log("\n=== Authorization:'Bearer (ASPAS SIMPLES = BUG) ===");
console.log("total:", count);
for (const loc of locations) {
  console.log(`\n[idx ${loc}]`);
  console.log("..." + content.substring(Math.max(0, loc - 120), loc + 90) + "...");
}

// Confere os corretos (backtick)
const good = 'Authorization:`Bearer';
let g = 0;
let gi = content.indexOf(good);
while (gi >= 0) { g++; gi = content.indexOf(good, gi + 1); }
console.log("\n=== Authorization:`Bearer (BACKTICK = OK) total:", g, "===");

// Concatenacao "Bearer "+ (OK)
const concat = 'Authorization:"Bearer "+';
let cc = 0;
let ci = content.indexOf(concat);
while (ci >= 0) { cc++; ci = content.indexOf(concat, ci + 1); }
console.log('=== Authorization:"Bearer "+ (CONCAT = OK) total:', cc, "===");
process.exit(0);
