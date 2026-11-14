import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [source, target] = process.argv.slice(2);
if (!source || !target || resolve(source) === resolve(target)) {
  console.error("Usage: node scripts/normalize-mysql-trigger-dump.mjs original.sql restored-copy.sql");
  process.exit(2);
}

// Use Latin-1 for a byte-preserving round trip regardless of the SQL file encoding.
const sql = await readFile(source, "latin1");
let count = 0;
const normalized = sql.replace(
  /(^DELIMITER ;;\r?\n\/\*!50003 CREATE\*\/[^\r\n]*\/\*!50003 TRIGGER (?:(?!\r?\nDELIMITER ;)[\s\S])*?);( \*\/;;\r?\nDELIMITER ;\r?$)/gm,
  (_block, trigger, end) => {
    count++;
    return trigger + end;
  },
);
await writeFile(target, normalized, { encoding: "latin1", flag: "wx", mode: 0o600 });
console.log(`${count} terminaison(s) de déclencheur corrigée(s).`);
