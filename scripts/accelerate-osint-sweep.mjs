import fs from 'node:fs';
import path from 'node:path';
import { resolvePrivateInputs, repositoryRootPath } from './lib/private-inputs.mjs';
import { buildOperationalSourceRegistry } from './lib/source-registry.mjs';
import { createXBrowserSession, normalizeBrowserObservation } from './lib/x-browser-collection.mjs';
import { isRequiredRecurringSource, validateSweepRunShape } from './lib/sweep.mjs';
import { FAILURE, SUCCESS, acquireSources, acquisitionContext, atomicJson, digest, openAcquisitionJournal, retrievalWindow } from './lib/acquisition.mjs';
import { preprocessEvidence, adjudicationQueue, reconcileFleet } from './lib/sweep-analysis.mjs';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const mode = arg('mode');
if (!['plan', 'process', 'status'].includes(mode)) throw new Error('Use --mode=plan|process|status --run=FILE --state=PRIVATE_DIRECTORY [--packets=PRIVATE_DIRECTORY]');
const inputs = resolvePrivateInputs();
if (inputs.mode !== 'external') throw new Error('Accelerated real sweeps require external private inputs');
const directory = privateDirectory(arg('state'));
const run = JSON.parse(fs.readFileSync(arg('run'), 'utf8'));
const registry = inputs.readJson('sources'), entities = inputs.readJson('vessels');
const operations = buildOperationalSourceRegistry(registry, entities);
const sources = registry.sources.filter(s => isRequiredRecurringSource(s) || (s.enabled !== false && s.xCollection?.enabled)).map(s => ({ ...s, ...{ mandatory: isRequiredRecurringSource(s), acquisition: operations.find(o => o.sourceId === s.sourceId).acquisition } }));
const stale = new Set(reconcileFleet({ entities, assessmentLog: inputs.readJson('assessments'), evidenceItems: inputs.readJson('evidence').evidence, run, at: run.window.to }).staleWarnings);
for (const source of sources) {
  source.staleEvidencePriority = Boolean(source.vesselId && stale.has(source.vesselId));
}
sources.sort((a,b) => Number(b.staleEvidencePriority)-Number(a.staleEvidencePriority) || a.sourceId.localeCompare(b.sourceId));
const journal = openAcquisitionJournal(directory, { readOnly: mode === 'status' });
try {
  if (mode === 'plan') {
    const tasks = sources.map(source => ({ sourceId: source.sourceId, mandatory: source.mandatory,
      acquisition: source.acquisition, staleEvidencePriority: source.staleEvidencePriority, canonicalUrl: source.canonicalUrl,
      window: acquisitionContext(source, journal, run.window.to).window,
      previousCursor: journal.latest(source.sourceId)?.cursor || null }));
    atomicJson(path.join(directory, 'plan.json'), { runId: run.runId, registryHash: run.sourceRegistryHash, tasks,
      browserConcurrency: 2, httpConcurrency: 4, note: 'Rendered Chrome only for X. Complete canary before full accounts. Two-tab capability observed on 8 September 2026; verify at each wake and fall back to one if unsupported. Record extraction packets for the exact source/window; missing packets fail closed.' });
    console.log(JSON.stringify({ runId: run.runId, tasks: tasks.length, mandatory: tasks.filter(t => t.mandatory).length }));
  } else if (mode === 'process') {
    if (run.complete) throw new Error('Do not process a sealed sweep; use historical replay');
    const packetDirectory = privateDirectory(arg('packets'));
    const plans = JSON.parse(fs.readFileSync(path.join(directory, 'plan.json'), 'utf8'));
    if (plans.runId !== run.runId || plans.registryHash !== run.sourceRegistryHash) throw new Error('Acquisition plan binding changed');
    const adapter = async ({ source, window }) => {
      const file = path.join(packetDirectory, `${digest(source.sourceId)}.json`);
      if (!fs.existsSync(file)) return { outcome: 'DEFERRED_WITH_JUSTIFICATION', reason: 'No completed source observation packet' };
      const packet = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (packet.runId !== run.runId || packet.sourceId !== source.sourceId || digest(packet.window) !== digest(window) || packet.registryHash !== run.sourceRegistryHash) throw new Error('Observation packet binding mismatch');
      if (FAILURE.has(packet.outcome)) {
        if (source.xCollection && packet.partialItems !== undefined) throw new Error('X partial items require native rendered observation normalization');
        if (!packet.partialObservation) return packet;
        if (!source.xCollection) throw new Error('Partial observation requires native X contract');
        const observation=packet.partialObservation, partialWindow=observation.method?.window;
        if (!partialWindow || !Number.isFinite(Date.parse(partialWindow.from)) || !Number.isFinite(Date.parse(partialWindow.to)) ||
          Date.parse(partialWindow.from)<Date.parse(window.from) || Date.parse(partialWindow.to)>Date.parse(window.to) || Date.parse(partialWindow.from)>=Date.parse(partialWindow.to)) throw new Error('Partial observation window is outside acquisition window');
        const session=createXBrowserSession({registry,run,sourceIds:[source.sourceId],scope:'canary',createdAt:new Date().toISOString()});
        const normalized=normalizeBrowserObservation({observation,account:session.accounts[0],window:partialWindow,entities,officialSocialCoverage:registry.officialSocialCoverage,knownLocations:[]});
        if (normalized.accountResult.state!=='checked') return {outcome:'PARSING_FAILURE',reason:'Partial browser observation failed normalization'};
        return {...packet,method:normalized.accountResult.method,partialItems:normalized.posts.map(p=>({id:p.postId,url:p.canonicalUrl,text:p.sourceClaim.excerpt,sourceContentHash:p.contentHash,publishedAt:p.sourceClaim.publishedAt,retrievedAt:p.sourceClaim.retrievedAt,originId:p.originId,eventTime:p.interpretation.eventTime}))};
      }
      if (source.xCollection && (packet.method?.browser !== 'chrome' || packet.method?.renderedPublicPage !== true || packet.method?.readOnly !== true)) throw new Error('X requires rendered public Chrome observation');
      if (source.xCollection) {
        const session = createXBrowserSession({ registry, run, sourceIds: [source.sourceId], scope: 'canary', createdAt: new Date().toISOString() });
        const normalized = normalizeBrowserObservation({ observation: packet.observation, account: session.accounts[0],
          window: { from: window.from, to: window.to }, entities, officialSocialCoverage: registry.officialSocialCoverage, knownLocations: [] });
        if (normalized.accountResult.state !== 'checked') return { outcome: normalized.accountResult.blocker.type === 'schema-failed' ? 'PARSING_FAILURE' : 'RETRIEVAL_FAILURE', reason: normalized.accountResult.blocker.message };
        return { ...packet, method: normalized.accountResult.method, examined: true, extractionComplete: true,
          items: normalized.posts.map(p => ({ id: p.postId, url: p.canonicalUrl, text: p.sourceClaim.excerpt, sourceContentHash: p.contentHash, publishedAt: p.sourceClaim.publishedAt,
            retrievedAt: p.sourceClaim.retrievedAt, originId: p.originId, eventTime: p.interpretation.eventTime })) };
      }
      return packet;
    };
    const result = await acquireSources({ sources, runId: run.runId, registryHash: run.sourceRegistryHash, cutoff: run.window.to, journal,
      adapters: Object.fromEntries(sources.map(s => [s.acquisition.adapter, adapter])),
      extract: (items, source, window) => preprocessEvidence(items, source, { vessels: entities.vessels, cutoff: window.to, windowStart: window.from }),
      onProgress: r => console.log(JSON.stringify({ sourceId: r.sourceId, outcome: r.outcome, durationMs: r.durationMs })) });
    atomicJson(path.join(directory, 'acquisition.json'), result);
    const processedRun = structuredClone(run);
    if (processedRun.complete) throw new Error('Do not modify a sealed sweep; use historical replay');
    for (const record of result.records) {
      const check = processedRun.sourceChecks.find(s => s.sourceId === record.sourceId);
      if (!check) continue;
      const success = SUCCESS.has(record.outcome);
      Object.assign(check, { state: success ? 'complete' : 'blocked', checkedAt: success ? record.checkedAt : null,
        outcome: success ? (record.items.length ? 'candidates-found' : 'manual-review-complete') : null,
        notes: success ? `Completed acquisition transaction ${record.hash}; bounded rendered coverage limitations retained in method metadata.` : null,
        blocker: success ? null : { type: { AUTHENTICATION_FAILURE:'authentication-required', PARSING_FAILURE:'schema-failed', RATE_LIMITED:'rate-limited', DEFERRED_WITH_JUSTIFICATION:'not-searched' }[record.outcome] || 'manual-unavailable', at: record.checkedAt, message: record.reason },
      });
    }
    validateSweepRunShape(processedRun);
    atomicJson(path.join(directory, 'processed-sweep-run.json'), processedRun);
    atomicJson(path.join(directory, 'adjudication-queue.json'), adjudicationQueue(result.records.flatMap(r => r.candidates)));
    if (result.records.some(r => r.mandatory && !SUCCESS.has(r.outcome))) process.exitCode = 1;
  } else {
    const records = sources.map(s => journal.transactions.findLast(t => t.runId === run.runId && t.sourceId === s.sourceId)).filter(Boolean);
    console.log(JSON.stringify({ runId: run.runId, running: fs.existsSync(path.join(directory, 'writer.lock')), fleetReconciliationComplete: run.vesselOutcomes.every(v=>v.state==='complete'), releaseReadiness: run.sweepCertificate?.status || 'NOT_CERTIFIED', total: sources.length, completed: records.length,
      outcomes: records.reduce((o,r) => ({ ...o, [r.outcome]: (o[r.outcome] || 0) + 1 }), {}),
      candidates: records.reduce((n,r) => n+r.candidates.length,0), slowest: [...records].sort((a,b)=>b.durationMs-a.durationMs).slice(0,5).map(r=>({ sourceId:r.sourceId, durationMs:r.durationMs })), publicationEligible:false }, null, 2));
  }
} finally { journal.close(); }
function privateDirectory(value) {
  if (!value || !path.isAbsolute(value)) throw new Error('An absolute private directory is required');
  fs.mkdirSync(value, { recursive: true, mode: 0o700 });
  const resolved = fs.realpathSync(value), relative = path.relative(repositoryRootPath(), resolved);
  if (!relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Acquisition data must remain outside the checkout');
  let parent = resolved;
  while (parent !== path.dirname(parent)) {
    if (fs.existsSync(path.join(parent, '.git'))) throw new Error('Acquisition data must remain outside every checkout');
    parent = path.dirname(parent);
  }
  return resolved;
}
