// Owner-approved 8 September 2026; applies to current-only AIS bootstrap, never failed current retrieval.
export const BOOTSTRAP_OUTCOME = 'CHECKED_CURRENT_BASELINE_WITH_HISTORICAL_EXCEPTION';
export const BOOTSTRAP_POLICY = 'public-ais-initial-baseline-2026-09-08';
const SOURCES = new Set(['MARINEVESSELTRAFFIC_NATO_DISCOVERY', 'VESSELFINDER_PUBLIC_WEEKLY']);
export function validateBootstrapException(value, { sourceId, window, previous = null }) {
  const review = value?.currentReview;
  if (!SOURCES.has(sourceId) || previous?.cursor || !window?.deep || value?.policyId !== BOOTSTRAP_POLICY ||
      value?.approvalReference !== 'owner-approval-2026-09-08' || !value.reason?.trim() ||
      value.historicalDisposition !== 'SOURCE_UNAVAILABLE' || value.windowFrom !== window.from || value.windowTo !== window.to ||
      review?.complete !== true || review.asOf !== window.to || !review.reviewer?.trim() ||
      !Number.isFinite(Date.parse(review.completedAt)) || Date.parse(review.completedAt) < Date.parse(window.to) ||
      !/^[a-f0-9]{64}$/.test(review.artifactHash || '') || !Array.isArray(review.evidenceRefs) ||
      !review.evidenceRefs.length || review.evidenceRefs.some(r => typeof r !== 'string' || !r.trim())) {
    throw new Error('Invalid public AIS bootstrap exception or incomplete current review');
  }
  return value;
}
