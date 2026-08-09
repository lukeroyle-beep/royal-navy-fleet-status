import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["vessels.json", "publication-changes.json", "status-history.jsonl"];
const destinationDirectory = path.join(root, "dist", "data", "royal-navy");

fs.mkdirSync(destinationDirectory, { recursive: true });
for (const file of files) {
  fs.copyFileSync(
    path.join(root, "data", "royal-navy", file),
    path.join(destinationDirectory, file),
  );
}
console.log(`Copied ${files.length} fleet data files into the production build.`);
