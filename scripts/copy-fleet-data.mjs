import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "vessels.json",
  "shore-establishments.json",
  "publication-changes.json",
  "status-history.jsonl",
  "status-location-history.jsonl",
  "status-history-catalog.json",
];
const destinationDirectory = path.join(root, "dist", "data", "royal-navy");

fs.mkdirSync(destinationDirectory, { recursive: true });
for (const file of files) {
  fs.copyFileSync(
    path.join(root, "data", "royal-navy", file),
    path.join(destinationDirectory, file),
  );
}
console.log(`Copied ${files.length} fleet data files into the production build.`);
