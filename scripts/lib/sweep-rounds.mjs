import { planAcquisitionSource } from './acquisition.mjs';
import { assertPrivateArtifact } from './private-artifacts.mjs';

const fail = code => { throw new Error(code); };

// Identity of a stopped round. Recording it creates no run, lock, or cursor.
export function sweepResumeBlock(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('RESUME_BLOCK_INVALID');
  if (input.publicationEligible === true) fail('RESUME_PUBLICATION_REFUSED');
  const keys = ['runId', 'cutoff', 'registryHash', 'acquisitionDirectory', 'browserSessionPath', 'nextReviewBatchIndex', 'threadId'];
  if (Object.keys(input).some(key => !keys.includes(key) && key !== 'publicationEligible')) fail('RESUME_BLOCK_INVALID');
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(input.runId || '')) fail('RESUME_BLOCK_INVALID');
  if (!Number.isFinite(Date.parse(input.cutoff || ''))) fail('RESUME_BLOCK_INVALID');
  if (!/^[a-f0-9]{64}$/.test(input.registryHash || '')) fail('RESUME_BLOCK_INVALID');
  if (!Number.isSafeInteger(input.nextReviewBatchIndex) || input.nextReviewBatchIndex < 0 || input.nextReviewBatchIndex > 10000) fail('RESUME_BLOCK_INVALID');
  if (!/^[a-f0-9-]{36}$/i.test(input.threadId || '')) fail('RESUME_BLOCK_INVALID');
  const acquisitionDirectory = assertPrivateArtifact(input.acquisitionDirectory);
  const browserSessionPath = assertPrivateArtifact(input.browserSessionPath);
  return { schemaVersion: 1, kind: 'rnfs-sweep-round', runId: input.runId, cutoff: input.cutoff,
    registryHash: input.registryHash, acquisitionDirectory, browserSessionPath,
    nextReviewBatchIndex: input.nextReviewBatchIndex, threadId: input.threadId, publicationEligible: false };
}

// Reopen an existing round only when run id, registry hash, and cutoff match.
// Uses the acquisition planner, index checkpoint, X session, and review batch.
// Does not collect, lock, or publish.
export function assertSweepResume({ resume, run, indexCheckpoint, browserSession, reviewPlan, source, journal } = {}) {
  const block = sweepResumeBlock(resume);
  if (!run || run.runId !== block.runId) fail('RESUME_RUN_MISMATCH');
  if (run.sourceRegistryHash !== block.registryHash) fail('RESUME_REGISTRY_MISMATCH');
  if (run.window?.to !== block.cutoff) fail('RESUME_CUTOFF_MISMATCH');
  if (indexCheckpoint) {
    if (indexCheckpoint.runId !== block.runId || indexCheckpoint.sourceRegistryHash !== block.registryHash ||
        indexCheckpoint.window?.to !== block.cutoff) fail('RESUME_INDEX_MISMATCH');
  }
  if (browserSession) {
    if (browserSession.publicationEligible === true) fail('RESUME_PUBLICATION_REFUSED');
    if (browserSession.runId !== block.runId || browserSession.window?.to !== block.cutoff) fail('RESUME_BROWSER_MISMATCH');
  }
  let acquisition = null;
  if (source || journal) {
    if (!source || !journal) fail('RESUME_ACQUISITION_INCOMPLETE');
    acquisition = planAcquisitionSource({ source, runId: block.runId, registryHash: block.registryHash, cutoff: block.cutoff, journal });
  }
  let review = null;
  if (reviewPlan) {
    if (reviewPlan.publicationEligible !== false) fail('RESUME_PUBLICATION_REFUSED');
    const batch = reviewPlan.batches?.[block.nextReviewBatchIndex];
    if (!batch?.items) fail('RESUME_REVIEW_BATCH_MISSING');
    review = { batch: block.nextReviewBatchIndex, items: batch.items.map(item => item.evidenceId), publicationEligible: false };
  }
  return { schemaVersion: 1, kind: 'rnfs-sweep-resume', publicationEligible: false, resume: block,
    acquisition, review, browserSessionMatched: Boolean(browserSession), indexCheckpointMatched: Boolean(indexCheckpoint) };
}
