import { readReviewedPublicLocation } from './public-geography.mjs';

// Explicit, reviewed retention; never search arbitrary old snapshots for a convenient point.
export function retainedLocationAssessment(assessment, assessments, evidenceItems = null) {
  const retained = assessment.retainedLocation;
  if (!retained) return null;
  const previous = assessments.find(a => a.assessmentId === retained.assessmentId);
  const location = readReviewedPublicLocation(previous?.assessedState?.publicLocation);
  const state = assessment.assessedState;
  const selected = new Set(assessment.selectedEvidenceIds || []);
  if (!['current-location-unknown', 'current-location-ambiguous'].includes(retained.reason) ||
      !retained.reviewedBy?.trim() || !Number.isFinite(Date.parse(retained.reviewedAt)) ||
      Date.parse(retained.reviewedAt) > Date.parse(assessment.assessedAt) ||
      !Number.isFinite(Date.parse(retained.observedAt)) || Date.parse(retained.observedAt) > Date.parse(retained.reviewedAt) ||
      !previous || previous.vesselId !== assessment.vesselId || Date.parse(previous.assessedAt) > Date.parse(assessment.assessedAt) ||
      previous.assessmentId === assessment.assessmentId || !location || location.precision === 'none' ||
      !['mapped', 'approximate'].includes(previous.assessedState.locationClassification) ||
      state.locationClassification !== 'unknown' || state.locationState === 'withheld' ||
      !Array.isArray(retained.evidenceIds) || !retained.evidenceIds.length ||
      retained.evidenceIds.some(id => !selected.has(id) || !previous.selectedEvidenceIds.includes(id) || assessment.excludedEvidenceIds?.includes(id))) {
    throw new Error('Invalid or unsupported last-known-location retention');
  }
  if (evidenceItems) {
    for (const id of retained.evidenceIds) {
      const evidence = evidenceItems.find(e => e.evidenceId === id);
      if (!evidence || evidence.vesselId !== assessment.vesselId || evidence.supersededBy ||
          !['direct'].includes(evidence.directness) ||
          !['explicit', 'inferred'].includes(evidence.observation?.basis) ||
          ![evidence.observation.from, evidence.observation.to].includes(retained.observedAt)) {
        throw new Error('Last-known location requires retained dated direct evidence, not superseded or conflated observations');
      }
    }
  }
  return { previous, location, retained };
}
