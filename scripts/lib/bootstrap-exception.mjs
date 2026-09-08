// Owner-approved initial baselines only; never excuses failed current retrieval.
export const BOOTSTRAP_OUTCOME = 'CHECKED_CURRENT_BASELINE_WITH_HISTORICAL_EXCEPTION';
export const BOOTSTRAP_POLICY = 'public-ais-initial-baseline-2026-09-08';
export const DIRECTORY_BOOTSTRAP_POLICY = 'official-directories-initial-baseline-2026-09-08';
const POLICIES = new Map([
  ['MARINEVESSELTRAFFIC_NATO_DISCOVERY', [BOOTSTRAP_POLICY, 'owner-approval-2026-09-08']],
  ['VESSELFINDER_PUBLIC_WEEKLY', [BOOTSTRAP_POLICY, 'owner-approval-2026-09-08']],
  ['RN_OFFICIAL_SHIPS', [DIRECTORY_BOOTSTRAP_POLICY, 'owner-directory-approval-2026-09-08']],
  ['ROYAL_NAVY_UNIT_PAGES', [DIRECTORY_BOOTSTRAP_POLICY, 'owner-directory-approval-2026-09-08']],
]);
export function validateBootstrapException(value, { sourceId, window, previous = null }) {
  const review = value?.currentReview;
  const policy = POLICIES.get(sourceId);
  // Undated directory pages establish the observed baseline, not a retrospectively
  // asserted state at the sweep cutoff. Keep the cursor cutoff conservative.
  const validAsOf = policy?.[0] === DIRECTORY_BOOTSTRAP_POLICY
    ? review?.asOf === review?.completedAt && Date.parse(review?.asOf) >= Date.parse(window?.to)
    : review?.asOf === window?.to;
  if (!policy || previous?.cursor || !window?.deep || value?.policyId !== policy[0] ||
      value?.approvalReference !== policy[1] || !value.reason?.trim() ||
      value.historicalDisposition !== 'SOURCE_UNAVAILABLE' || value.windowFrom !== window.from || value.windowTo !== window.to ||
      review?.complete !== true || !validAsOf || !review.reviewer?.trim() ||
      !Number.isFinite(Date.parse(review.completedAt)) || Date.parse(review.completedAt) < Date.parse(window.to) ||
      !/^[a-f0-9]{64}$/.test(review.artifactHash || '') || !Array.isArray(review.evidenceRefs) ||
      !review.evidenceRefs.length || review.evidenceRefs.some(r => typeof r !== 'string' || !r.trim())) {
    throw new Error('Invalid approved bootstrap exception or incomplete current review');
  }
  return value;
}
