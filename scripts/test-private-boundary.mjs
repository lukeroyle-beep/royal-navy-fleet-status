import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { scanPublicExposure } from "./lib/client-exposure.mjs";
import {
  PRIVATE_FIXTURE_ENV,
  PRIVATE_ROOT_ENV,
  repositoryRootPath,
  resolvePrivateInputs,
  syntheticPrivateInputRoot,
} from "./lib/private-inputs.mjs";

const root = repositoryRootPath();
const fixtureRoot = syntheticPrivateInputRoot();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rnfs-private-boundary-"));

try {
  assert.equal(resolvePrivateInputs({ environment: {} }).mode, "legacy");
  rejects({ [PRIVATE_ROOT_ENV]: "" }, /must not be empty/);
  rejects({ [PRIVATE_ROOT_ENV]: "relative/private" }, /absolute path/);
  rejects({ [PRIVATE_ROOT_ENV]: path.join(temporaryRoot, "missing") }, /existing directory/);
  rejects({ [PRIVATE_ROOT_ENV]: root }, /outside the public repository/);
  rejects({ [PRIVATE_ROOT_ENV]: fixtureRoot }, /requires RNFS_PRIVATE_DATA_FIXTURE=1/);
  rejects({ [PRIVATE_FIXTURE_ENV]: "1" }, /requires RNFS_PRIVATE_DATA_ROOT/);

  const synthetic = resolvePrivateInputs({
    environment: { [PRIVATE_ROOT_ENV]: fixtureRoot, [PRIVATE_FIXTURE_ENV]: "1" },
  });
  assert.equal(synthetic.mode, "synthetic");
  assert.equal(synthetic.readJson("vessels").vessels[0].vesselId, "hms-fixture");

  const malformedRoot = path.join(temporaryRoot, "malformed");
  fs.mkdirSync(malformedRoot);
  fs.writeFileSync(path.join(malformedRoot, "private-input-manifest.json"), "{not json}\n");
  rejects({ [PRIVATE_ROOT_ENV]: malformedRoot }, /manifest is not valid JSON/);

  const escapingRoot = path.join(temporaryRoot, "escaping");
  fs.mkdirSync(escapingRoot);
  fs.writeFileSync(path.join(escapingRoot, "private-input-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    kind: "rnfs-private-inputs",
    files: {
      vessels: "../vessels.json", sources: "sources.json", evidence: "evidence.json",
      assessments: "assessments.json", sweepRuns: "sweep-runs",
      shoreEstablishments: "shore-establishments.json",
      shorePhotoSources: "shore-photo-sources.json",
    },
  }));
  rejects({ [PRIVATE_ROOT_ENV]: escapingRoot }, /escapes its configured root/);

  const externalRoot = path.join(temporaryRoot, "external-private");
  fs.cpSync(fixtureRoot, externalRoot, { recursive: true });
  const manifestPath = path.join(externalRoot, "private-input-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.kind = "rnfs-private-inputs";
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(resolvePrivateInputs({ environment: { [PRIVATE_ROOT_ENV]: externalRoot } }).mode, "external");
  rejects(
    { [PRIVATE_ROOT_ENV]: externalRoot, [PRIVATE_FIXTURE_ENV]: "1" },
    /valid only for the committed synthetic fixture/,
  );

  const incompleteRoot = path.join(temporaryRoot, "incomplete-private");
  fs.cpSync(externalRoot, incompleteRoot, { recursive: true });
  fs.rmSync(path.join(incompleteRoot, "evidence.json"));
  rejects({ [PRIVATE_ROOT_ENV]: incompleteRoot }, /Private input evidence is missing/);

  const outputRoot = path.join(temporaryRoot, "public-output");
  const generated = spawnSync(process.execPath, [
    path.join(root, "scripts/generate-public-projection.mjs"),
    `--output-root=${outputRoot}`,
    `--status-history=${path.join(fixtureRoot, "status-history.jsonl")}`,
  ], {
    cwd: root,
    env: { ...process.env, [PRIVATE_ROOT_ENV]: fixtureRoot, [PRIVATE_FIXTURE_ENV]: "1" },
    encoding: "utf8",
  });
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const registry = synthetic.readJson("sources");
  const scanOptions = {
    rootDirectory: outputRoot,
    registry,
    fleetPath: "vessels.json",
    historyPath: "status-history-catalog.json",
    expectedFleetCount: 1,
    forbiddenTokens: ["SYNTH_INTERNAL_ONLY", "SYNTHETIC_EVIDENCE_1", "SYNTH_INTERNAL_ORIGIN"],
  };
  assert.equal(scanPublicExposure(scanOptions), 2);

  const legacyBuildOutput = path.join(temporaryRoot, "legacy-build-output");
  const legacyEnvironment = { ...process.env };
  delete legacyEnvironment[PRIVATE_ROOT_ENV];
  delete legacyEnvironment[PRIVATE_FIXTURE_ENV];
  const preserved = spawnSync(process.execPath, [
    path.join(root, "scripts/generate-public-projection.mjs"),
    "--preserve-reviewed-without-external",
    `--output-root=${legacyBuildOutput}`,
  ], {
    cwd: root,
    env: legacyEnvironment,
    encoding: "utf8",
  });
  assert.equal(preserved.status, 0, preserved.stderr || preserved.stdout);
  assert.match(preserved.stdout, /Preserved the reviewed public projection/);
  assert.equal(
    fs.existsSync(legacyBuildOutput),
    false,
    "A no-external-root build must not write a projection from stale legacy provenance.",
  );

  const reviewedValidation = spawnSync(process.execPath, [
    path.join(root, "scripts/validate-fleet-data.mjs"),
    "--allow-reviewed-public-without-external",
  ], {
    cwd: root,
    env: legacyEnvironment,
    encoding: "utf8",
  });
  assert.equal(reviewedValidation.status, 0, reviewedValidation.stderr || reviewedValidation.stdout);
  assert.match(reviewedValidation.stdout, /Preserved reviewed public release/);

  const fleetPath = path.join(outputRoot, "vessels.json");
  const cleanFleet = fs.readFileSync(fleetPath, "utf8");
  const fleet = JSON.parse(cleanFleet);
  fleet.vessels[0].analystNotes = "must be rejected";
  fs.writeFileSync(fleetPath, JSON.stringify(fleet));
  assert.throws(() => scanPublicExposure(scanOptions), /exposes analystNotes/);
  fs.writeFileSync(fleetPath, cleanFleet);

  const secret = ["gh", "p_", "A".repeat(24)].join("");
  const leakPath = path.join(outputRoot, "leak.json");
  fs.writeFileSync(leakPath, JSON.stringify({ value: secret }));
  assert.throws(() => scanPublicExposure(scanOptions), /secret-like GitHub token/);
  fs.rmSync(leakPath);
  assert.equal(scanPublicExposure(scanOptions), 2);

  const credentialPath = path.join(outputRoot, "local.credentials.json");
  fs.writeFileSync(credentialPath, JSON.stringify({ fixture: true }));
  assert.throws(() => scanPublicExposure(scanOptions), /prohibited credential file/);
  fs.rmSync(credentialPath);
  assert.equal(scanPublicExposure(scanOptions), 2);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("Private input boundary tests passed with synthetic-only generation and fail-closed roots.");

function rejects(environment, pattern) {
  assert.throws(() => resolvePrivateInputs({ environment }), pattern);
}
