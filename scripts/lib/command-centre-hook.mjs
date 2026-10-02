import fs from 'node:fs';
import path from 'node:path';
import { enqueue, digest } from './command-centre.mjs';
import { assertPrivateArtifact } from './private-artifacts.mjs';

// Hooks record evidence only. The authenticated Codex Pages adapter performs
// delivery; this module has no network, model, collection or credential access.
export function recordPreflightReporting({receipt, receiptPath, contextPath=process.env.RNFS_COMMAND_CENTRE_CONTEXT, outbox=process.env.RNFS_COMMAND_CENTRE_OUTBOX}) {
  if (!contextPath && !outbox) return {enabled:false};
  if (!contextPath || !outbox) throw new Error('REPORTING_CONTEXT_AND_OUTBOX_REQUIRED');
  const context=JSON.parse(fs.readFileSync(assertPrivateArtifact(contextPath),'utf8'));
  const at=receipt.finishedAt || receipt.completedAt || new Date(Date.parse(receipt.startedAt || receipt.checkedAt) + (receipt.elapsedMs || 0)).toISOString();
  if (receipt.runId && receipt.runId !== context.runId) throw new Error('REPORTING_RUN_MISMATCH');
  const failed=receipt.outcome==='DEFERRED_WITH_JUSTIFICATION' || receipt.outcome==='BLOCKED' || receipt.outcome==='FAILED' || receipt.outcome==='STAGE_FAILED' || receipt.outcome==='INCOMPLETE_DISCOVERY';
  const preflightFailed=receipt.preflightOutcome ? receipt.preflightOutcome!=='READY_FOR_COLLECTION' : receipt.outcome!=='READY_FOR_COLLECTION';
  const outcome=failed ? (preflightFailed?'PREFLIGHT_FAILED':'COLLECTION_FAILED') : 'IN_PROGRESS';
  const event={...context,schemaVersion:1,eventId:`${context.runId}_${digest(fs.readFileSync(receiptPath,'utf8')).slice(0,16)}`,revision:Date.parse(at),recordedAt:at,evidenceAt:at,completedAt:failed?at:null,outcome,
    coverage:{sources:[receipt.coverage?.completedSourceChecks??null,receipt.coverage?.requiredSourceChecks??null],discovery:[receipt.coverage?.completedDiscoveryChecks??null,receipt.coverage?.requiredDiscoveryChecks??null],vessels:[receipt.coverage?.completedVesselOutcomes??null,receipt.coverage?.requiredVesselOutcomes??null],integrity:[receipt.coverage?.completedIntegrityChecks??null,receipt.coverage?.requiredIntegrityChecks??null]},
    publication:'Not published by preflight/discovery; subsequent publication unverified',blocker:failed?'Recorded preflight or discovery stage failure; see private receipt':'Full coverage and release gates remain incomplete',nextAction:failed?'Review recorded gate; retain prior release':'Continue only authorised coverage and review',backup:'See recorded preflight backup gate; final recovery backup unverified',facts:'Automatic stage report. Discovery completion is not full source coverage. Space authentication is separate.'};
  return enqueue(outbox,event,[{path:receiptPath,sha256:digest(fs.readFileSync(receiptPath,'utf8'))},{path:contextPath,sha256:digest(fs.readFileSync(contextPath,'utf8'))}]);
}
export function reportWithoutChangingSweep(args) {
  try { return recordPreflightReporting(args); }
  catch(error) {
    // The original receipt remains authoritative and replayable even if reporting
    // cannot persist. Never change collection's exit status to hide delivery failure.
    const diagnostic={at:new Date().toISOString(),kind:'command-centre-enqueue-error',error:error.message,receiptPath:args.receiptPath,sweepResultUnchanged:true};
    try { fs.writeFileSync(assertPrivateArtifact(`${args.receiptPath}.reporting-error.json`),JSON.stringify(diagnostic)+'\n',{flag:'wx',mode:0o600}); } catch { /* stderr is also captured by native scheduler */ }
    console.error(JSON.stringify(diagnostic)); return {reportingError:error.message};
  }
}
export function recordEarlyFailure({contextPath=process.env.RNFS_COMMAND_CENTRE_CONTEXT,outbox=process.env.RNFS_COMMAND_CENTRE_OUTBOX}) {
  if(!contextPath || !outbox) return;
  const folder=assertPrivateArtifact(outbox);fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const at=new Date().toISOString();const receipt={outcome:'FAILED',finishedAt:at,diagnostic:'PREFLIGHT_OR_REQUESTED_STAGE_FAILED',publicationEligible:false};
  const receiptPath=path.join(folder,`early-failure-${at.replaceAll(':','-')}.json`);
  fs.writeFileSync(receiptPath,JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
  return reportWithoutChangingSweep({receipt,receiptPath,contextPath,outbox});
}
