import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { parsePhysicalStatusHistory } from "../src/utils/insights.js";
import { parseLocationHistory } from "../src/utils/location-history.js";

const data = new URL("../data/royal-navy/", import.meta.url);
const text = fs.readFileSync(new URL("status-location-history.jsonl", data), "utf8");
const history = parsePhysicalStatusHistory(fs.readFileSync(new URL("status-history.jsonl", data), "utf8"));
const catalog = JSON.parse(fs.readFileSync(new URL("status-history-catalog.json", data), "utf8"));
const records = parseLocationHistory(text, history, catalog);
const index = process.argv.indexOf("--base-ref");
if (index !== -1) {
  const base = process.argv[index + 1];
  if (!base || base.startsWith("-")) throw new Error("--base-ref requires a commit reference.");
  execFileSync("git", ["cat-file", "-e", `${base}^{commit}`]);
  const file = "data/royal-navy/status-location-history.jsonl";
  if (execFileSync("git", ["ls-tree", "--name-only", base, "--", file], { encoding: "utf8" }).trim()) {
    const before = execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8" });
    if (!text.startsWith(before)) throw new Error("Location history is append-only; existing bytes changed.");
  }
}
console.log(`Validated ${records.length} exact-release public location snapshots.`);
