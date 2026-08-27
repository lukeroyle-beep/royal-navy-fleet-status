import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "docs", "fleet-tracker-programme-completion.md");
const destination = path.join(root, "dist", "docs", "fleet-tracker-programme-completion.md");

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log("Copied the fleet tracker programme completion document into the build.");
