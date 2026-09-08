import { validateSourceRegistry, validateEvidenceLog, validateAssessmentLog } from './provenance.mjs';
import { createPublicProjection } from './public-projection.mjs';
import { validateFleet } from '../../src/components/ScenarioLoader.js';
import { digest } from './acquisition.mjs';
import { computeReleaseContentHash, validateSweepRunShape } from './sweep.mjs';
export function validateCertificateCandidate({ entities, registry, evidenceLog, assessmentLog, run }) {
  const current = entities.vessels.map(v => v.vesselId), known = [...current, ...(entities.retiredVessels || []).map(v=>v.vesselId)];
  validateSourceRegistry(registry, known, current);
  validateEvidenceLog(evidenceLog, registry.sources.map(s=>s.sourceId), known);
  validateAssessmentLog(assessmentLog, evidenceLog.evidence, known, current);
  validateSweepRunShape(run);
  const projection=createPublicProjection(entities, assessmentLog);
  validateFleet(projection);
  if (computeReleaseContentHash({entities,registry,assessmentLog,evidenceItems:evidenceLog.evidence}) !== run.releaseContentHash) throw new Error('Certificate candidate differs from sealed release');
  const completedAt=new Date().toISOString();
  return {
    schema:{pass:true,artifactHash:digest({entities,registry,assessmentLog}),command:'validateSourceRegistry + validateAssessmentLog + validateSweepRunShape',completedAt},
    ledger:{pass:true,artifactHash:digest(evidenceLog),command:'validateEvidenceLog',completedAt},
    snapshot:{pass:true,artifactHash:digest(projection),command:'createPublicProjection + validateFleet + computeReleaseContentHash',completedAt},
  };
}
