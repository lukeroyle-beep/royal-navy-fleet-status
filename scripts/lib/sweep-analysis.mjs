import { digest } from './acquisition.mjs';
import { extractEvidenceCandidate, findEvidenceContradictions, clusterEvidenceCandidates } from './evidence-processing.mjs';

// Absence of maritime words in an excerpt is not evidence of irrelevance.
// Only a complete text-only observation can use these deliberately narrow rules.
function deterministicTriage(item, matches) {
  if (item.contentComplete !== true || item.hasUnexaminedMedia !== false || item.revised || matches.length) return null;
  const text = item.text.trim();
  if (/https?:|www\.|…|\.\.\.|show more|\b(quote|correction|reportedly|possibly|unclear)\b/i.test(text)) return null;
  if (/\b(navy|naval|maritime|marine|marines|hms|rfa|ship|ships|vessel|vessels|submarine|submarines|carrier|frigate|destroyer|fleet|port|harbour|harbor|sea|seas|coast|sail|sailing|deploy|deployment|exercise|operation|maintenance|refit)\b/i.test(text)) return null;
  if (/^(?:Happy (?:Christmas|New Year|Easter|Father['’]s Day|Mother['’]s Day)|Merry Christmas)[!.\s]*$/i.test(text)) {
    return { ruleId: 'complete-text-only-greeting-v1', classification: 'irrelevant' };
  }
  return null;
}

export function preprocessEvidence(items, source, { vessels, current = [], cutoff, windowStart, locations = [], retainedEvidence = [] }) {
  const byId = new Map(current.map(v => [v.id || v.vesselId, v]));
  return items.map(item => {
    const extracted = extractEvidenceCandidate({ text: item.text, publishedAt: item.publishedAt, receivedAt: item.retrievedAt || cutoff, locations });
    const matches = vessels.filter(v => [v.name, v.pennantNumber, ...(v.aliases || [])].filter(Boolean).some(name => item.text.toLowerCase().includes(name.toLowerCase())));
    // An account's own vessel may be the subject of "we" even when another ship
    // is named. Preserve both candidates instead of assigning the whole claim to
    // the named ship. Class references likewise do not identify a single hull.
    const accountVessel = vessels.find(v => v.vesselId === source.vesselId);
    if (accountVessel && !matches.some(v => v.vesselId === accountVessel.vesselId)) matches.push(accountVessel);
    const classReference = /\bclass\b/i.test(item.text) && matches.length > 0;
    const vessel = matches.length === 1 && !classReference ? matches[0] : null;
    const state = byId.get(vessel?.vesselId);
    const reasons = [];
    const status = extracted.statusCandidate?.value || null;
    const location = extracted.locationCandidate?.value || null;
    const eventTime = item.eventTime || extracted.eventTime;
    if (!vessel) reasons.push('entity-unresolved-or-ambiguous');
    if (classReference) reasons.push('class-reference-requires-entity-review');
    if (!eventTime) reasons.push('event-time-unknown');
    if (eventTime && (Date.parse(eventTime) >= Date.parse(cutoff) || Date.parse(eventTime) < Date.parse(windowStart))) reasons.push('retrospective-or-outside-window');
    if (item.revised) reasons.push('historical-content-revised');
    if (vessel && /submarine|ssbn|ssn/i.test(JSON.stringify({ type: vessel.type, class: vessel.class, vesselType: vessel.vesselType }))) reasons.push('protected-activity-review');
    if (status && state && status !== state.status) reasons.push('state-transition');
    if (location && state && location !== state.location?.name) reasons.push('location-change');
    if (!status && !location) reasons.push('claim-requires-review');
    const exactRetained = retainedEvidence.find(e => e.sourceId === source.sourceId && e.canonicalUrl === item.url && e.contentHash === item.contentHash && e.reviewState === 'approved');
    const triage = deterministicTriage(item, matches);
    const priority = triage || (exactRetained && !item.revised && !reasons.length) ? 3 : reasons.length ? 1 : source.reliabilityTier === 'A' ? 2 : 1;
    return { evidenceId: `CAND_${digest({ sourceId: source.sourceId, id: item.id, contentHash: item.contentHash }).slice(0, 24)}`,
      sourceId: source.sourceId, sourceType: source.category, authorityTier: source.reliabilityTier,
      vesselId: vessel?.vesselId || null, candidateVesselIds: matches.filter(Boolean).map(v => v.vesselId),
      canonicalUrl: item.url, publishedAt: item.publishedAt, eventTime, receivedAt: item.retrievedAt || cutoff,
      claim: item.text.slice(0, 1000), supportingSpans: extracted.citedSpans, status, location,
      contentHash: item.contentHash, originId: item.originId || item.url, locationPrecision: 'unreviewed',
      directness: 'unreviewed', confidence: 'unreviewed', reviewState: 'new', publicationEligible: false,
      ...(triage ? { triageAudit: { ...triage, contentComplete: true, hasUnexaminedMedia: false, supersededReasons: reasons } } : {}),
      priority, classification: triage?.classification || (priority === 3 ? 'corroboration' : reasons.includes('state-transition') ? 'state-transition' : reasons.includes('location-change') ? 'location-change' : 'ambiguous-or-verification'), reasons: triage ? [triage.ruleId] : priority === 3 ? ['exact-retained-reviewed-evidence'] : reasons.length ? reasons : ['explicit-candidate-verification-required'] };
  });
}

export function adjudicationQueue(candidates) {
  const conflicts = findEvidenceContradictions(candidates);
  const conflictIds = new Set(conflicts.flatMap(c => c.candidateIds));
  const items = candidates.map(c => ({ ...c, priority: conflictIds.has(c.evidenceId) ? 1 : c.priority,
    reasons: [...new Set([...c.reasons, ...(conflictIds.has(c.evidenceId) ? ['conflicting-evidence'] : [])])],
    reasoning: (conflictIds.has(c.evidenceId) || c.priority === 1) ? { model: 'gpt-6-astra', effort: 'xhigh' } : c.triageAudit ? { effort: 'none', method: 'deterministic-triage' } : { effort: 'verification' } }));
  return { items: items.sort((a,b) => a.priority - b.priority || a.evidenceId.localeCompare(b.evidenceId)), conflicts, origins: clusterEvidenceCandidates(candidates) };
}

export function reconcileFleet({ entities, assessmentLog, evidenceItems, run, at, staleDays = { 'In re-fit': 180, Maintenance: 180, Alongside: 14, Deployed: 30, 'Museum ship': 365, default: 60 } }) {
  const evidence = new Map(evidenceItems.map(e => [e.evidenceId, e]));
  const assessments = new Map(assessmentLog.assessments.map(a => [a.assessmentId, a]));
  const outcomes = new Map(run.vesselOutcomes.map(o => [o.vesselId, o]));
  const records = entities.vessels.map(v => {
    const assessment = assessments.get(assessmentLog.currentAssessmentIds[v.vesselId]);
    const outcome = outcomes.get(v.vesselId);
    const selected = (assessment?.selectedEvidenceIds || []).map(id => evidence.get(id));
    const issues = [];
    if (!assessment || assessment.vesselId !== v.vesselId) issues.push('missing-current-assessment');
    if (outcome?.state !== 'complete') issues.push('vessel-review-incomplete');
    if (!selected.length && !['unknown', 'withheld'].includes(assessment?.assessedState?.locationClassification)) issues.push('missing-retained-support');
    if (selected.some(e => !e || e.vesselId !== v.vesselId)) issues.push('invalid-supporting-evidence');
    if ((assessment?.conflictingEvidenceIds || []).length && !['resolved', 'resolved-temporal-progression', 'resolved-source-precedence'].includes(assessment?.conflictState)) issues.push('unresolved-material-conflict');
    if (selected.some(e => Date.parse(e?.retrievedAt) > Date.parse(at))) issues.push('future-retrieval');
    // Imported publication/retrieval metadata must not rejuvenate an observation
    // whose event date was explicitly recorded as conflated or unknown.
    const latest = selected.filter(Boolean).map(e => e.observation?.to || e.observation?.from ||
      (['legacy-conflated', 'unknown'].includes(e.observation?.basis) ? null : e.publishedAt))
      .filter(t => Number.isFinite(Date.parse(t))).sort((a,b) => Date.parse(b)-Date.parse(a))[0] || null;
    const status = assessment?.assessedState?.status;
    const thresholdDays = staleDays[status] ?? staleDays.default;
    if (!Number.isFinite(thresholdDays) || thresholdDays <= 0) throw new Error('Invalid stale threshold');
    const stale = !latest || Date.parse(at)-Date.parse(latest) > thresholdDays*86400000;
    return { vesselId: v.vesselId, previousAssessmentId: run.coverageInputs.baselineAssessmentIds[v.vesselId], assessmentId: assessment?.assessmentId || null,
      selectedEvidenceIds: assessment?.selectedEvidenceIds || [], reviewedAt: outcome?.reviewedAt || null, latestSupportAt: latest, thresholdDays, stale, issues, pass: issues.length === 0 };
  });
  return { records, total: records.length, reconciled: records.filter(r => r.pass).length, staleWarnings: records.filter(r => r.stale).map(r => r.vesselId), pass: records.every(r => r.pass) };
}
