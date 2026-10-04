// Offline only: no source retrieval, evidence acceptance or historical writes.
import fs from 'node:fs';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { buildReviewPlan } from './lib/review-routing.mjs';
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
function read(file) {
  const p = assertPrivateArtifact(file), s = fs.statSync(p);
  if (!s.isFile() || s.size > 32 * 1024 * 1024) throw Error('REVIEW_INPUT_TOO_LARGE');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
const acquisition = read(arg('acquisition'));
const adjudication = arg('adjudication') ? read(arg('adjudication')) : { decisions: [] };
const plan = buildReviewPlan({ acquisition, adjudication });
let output = plan;
if (arg('batch') !== undefined) {
  if (!/^(0|[1-9][0-9]*)$/.test(arg('batch'))) throw Error('REVIEW_BATCH_INVALID');
  const batch = plan.batches[Number(arg('batch'))];
  if (!batch) throw Error('REVIEW_BATCH_INVALID');
  const byId = new Map(acquisition.records.flatMap(r => r.candidates).map(c => [c.evidenceId, c]));
  output = { ...batch, acquisitionHash: plan.acquisitionHash, instructions: plan.instructions,
    items: batch.items.map(i => ({ ...i, candidate: byId.get(i.evidenceId) })), publicationEligible: false };
}
if (!arg('output')) throw Error('REVIEW_OUTPUT_REQUIRED');
const file = assertPrivateArtifact(arg('output'));
fs.writeFileSync(file, JSON.stringify(output, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ file, candidateCount: plan.candidateCount, retainedDecisions: plan.retainedDecisions,
  effortCounts: plan.effortCounts, batches: plan.batches.length, selectedBatch: arg('batch') ?? null,
  publicationEligible: false }));
