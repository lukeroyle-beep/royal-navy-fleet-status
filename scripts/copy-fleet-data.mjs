import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "data", "royal-navy", "vessels.json");
const destination = path.join(root, "dist", "data", "royal-navy", "vessels.json");

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log("Copied fleet data into the production build.");
