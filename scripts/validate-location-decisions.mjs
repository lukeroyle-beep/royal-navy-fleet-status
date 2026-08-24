import fs from "node:fs";
import { execFileSync } from "node:child_process";

const logPath = new URL("../data/royal-navy/location-decisions.jsonl", import.meta.url);
const entitiesPath = new URL("../data/internal/provenance/vessels.json", import.meta.url);
const allowedDecisions = new Set(["promote", "retain-unknown", "downgrade", "withhold"]);
const allowedLocationClassifications = new Set(["mapped", "approximate", "unknown", "withheld"]);
const allowedEvidenceClassifications = new Set(["direct-report", "direct-tracker", "insufficient", "withheld-policy"]);
const mappableEvidence = new Set(["direct-report", "direct-tracker"]);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const currentText = fs.readFileSync(logPath, "utf8");
const lines = parseLines(currentText);
const entities = JSON.parse(fs.readFileSync(entitiesPath, "utf8"));
const vesselIds = new Set(
  [...entities.vessels, ...(entities.retiredVessels || [])].map((vessel) => vessel.vesselId),
);
const decisionIds = new Set();

for (const [index, line] of lines.entries()) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    throw new Error(`Location decision line ${index + 1} is not valid JSON.`);
  }

  const label = `Location decision line ${index + 1}`;
  if (record.schemaVersion !== 1) throw new Error(`${label} has an unsupported schemaVersion.`);
  for (const field of ["decisionId", "vesselId", "decision", "resultingLocationClassification", "evidenceClassification", "freshnessPolicy", "rationale"]) {
    if (typeof record[field] !== "string" || !record[field].trim()) {
      throw new Error(`${label} has an invalid ${field}.`);
    }
  }
  if (decisionIds.has(record.decisionId)) throw new Error(`Duplicate decisionId: ${record.decisionId}.`);
  decisionIds.add(record.decisionId);
  if (!vesselIds.has(record.vesselId)) throw new Error(`${label} references an unknown vesselId.`);
  if (!isIsoDate(record.evidenceCheckedDate)) throw new Error(`${label} has an invalid evidenceCheckedDate.`);
  if (record.locationEvidenceDate !== null && !isIsoDate(record.locationEvidenceDate)) {
    throw new Error(`${label} has an invalid locationEvidenceDate.`);
  }
  if (record.locationEvidenceDate && record.locationEvidenceDate > record.evidenceCheckedDate) {
    throw new Error(`${label} has a locationEvidenceDate after its evidenceCheckedDate.`);
  }
  if (!allowedDecisions.has(record.decision)) throw new Error(`${label} has an invalid decision.`);
  if (!allowedLocationClassifications.has(record.resultingLocationClassification)) {
    throw new Error(`${label} has an invalid resultingLocationClassification.`);
  }
  if (!allowedEvidenceClassifications.has(record.evidenceClassification)) {
    throw new Error(`${label} has an invalid evidenceClassification.`);
  }
  if (!record.source?.label?.trim() || !record.source?.url?.startsWith("https://")) {
    throw new Error(`${label} has an invalid source.`);
  }
  if (record.decision === "retain-unknown" && (record.resultingLocationClassification !== "unknown" || record.evidenceClassification !== "insufficient")) {
    throw new Error(`${label} has an inconsistent retain-unknown decision.`);
  }
  if (["mapped", "approximate"].includes(record.resultingLocationClassification) && (!record.locationEvidenceDate || !mappableEvidence.has(record.evidenceClassification))) {
    throw new Error(`${label} promotes a location without sufficient dated evidence.`);
  }
}

const baseRefIndex = process.argv.indexOf("--base-ref");
if (baseRefIndex !== -1) {
  const baseRef = process.argv[baseRefIndex + 1];
  if (!baseRef) throw new Error("--base-ref requires a Git commit reference.");
  execFileSync("git", ["cat-file", "-e", `${baseRef}^{commit}`], { stdio: "ignore" });
  let baseText = "";
  try {
    baseText = execFileSync("git", ["show", `${baseRef}:data/royal-navy/location-decisions.jsonl`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    baseText = "";
  }
  const baseLines = parseLines(baseText);
  if (lines.length < baseLines.length || baseLines.some((line, index) => lines[index] !== line)) {
    throw new Error("Location decision history is append-only; existing records were removed, reordered or modified.");
  }
}

console.log(`Validated ${lines.length} append-only location decision records.`);

function parseLines(text) {
  const trimmed = text.trimEnd();
  if (!trimmed) return [];
  const parsed = trimmed.split("\n");
  if (parsed.some((line) => !line.trim())) throw new Error("Location decision log contains a blank line.");
  return parsed;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !isoDate.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
