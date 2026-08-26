import crypto from "node:crypto";

const MONTHS = Object.freeze({
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
});

const ACTIVITY_PATTERNS = Object.freeze([
  ["arrived", /\b(?:arrived|returned|entered port)\b/i],
  ["departed", /\b(?:departed|sailed|left port|put to sea)\b/i],
  ["deployed", /\b(?:deployed|deployment)\b/i],
  ["exercise", /\b(?:exercise|exercising|drill)\b/i],
  ["maintenance", /\b(?:maintenance|refit|dry dock|repair)\b/i],
  ["underway", /\b(?:underway|at sea|sea trials?)\b/i],
]);

const STATUS_PATTERNS = Object.freeze([
  ["Maintenance", /\b(?:maintenance|refit|dry dock|repair)\b/i],
  ["Deployed", /\b(?:deployed|deployment|on station)\b/i],
  ["At sea", /\b(?:underway|at sea|sea trials?|sailed|departed)\b/i],
  ["Available", /\b(?:available|ready|operational)\b/i],
  ["Alongside", /\b(?:alongside|in port|berthed|arrived|returned)\b/i],
]);

const SOURCE_TIER_WEIGHT = Object.freeze({ A: 4, B: 3, C: 2, D: 1 });

export function matchVesselCandidate(query, vessels, officialSocialCoverage = []) {
  if (!Array.isArray(vessels)) throw new Error("Vessel matching requires a canonical roster.");
  const requested = typeof query === "string" ? { name: query } : query;
  if (!requested || typeof requested !== "object" || Array.isArray(requested)) {
    throw new Error("Vessel matching query must be text or an object.");
  }

  const coverageByVessel = new Map(
    officialSocialCoverage.map((entry) => [entry.vesselId, entry]),
  );
  const candidates = [];
  for (const vessel of vessels) {
    const explanations = [];
    compareIdentifier(requested.vesselId, vessel.vesselId, "vesselId", explanations);
    compareIdentifier(requested.pennantNumber, vessel.pennantNumber, "pennantNumber", explanations);
    compareIdentifier(requested.imo, vessel.imo, "imo", explanations);
    compareIdentifier(requested.mmsi, vessel.mmsi, "mmsi", explanations);
    compareIdentifier(requested.callsign, vessel.callsign, "callsign", explanations);

    const requestedName = requested.name || requested.alias || requested.accountAlias;
    if (requestedName) {
      const aliases = [
        vessel.name,
        ...(vessel.aliases || []),
        coverageByVessel.get(vessel.vesselId)?.accountHandle,
      ].filter(Boolean);
      const matchedAlias = aliases.find((alias) => normalise(alias) === normalise(requestedName));
      if (matchedAlias) {
        explanations.push({ field: "name-or-alias", requested: requestedName, matched: matchedAlias });
      }
    }
    if (explanations.length) {
      candidates.push({
        vesselId: vessel.vesselId,
        name: vessel.name,
        matchedBy: explanations,
      });
    }
  }

  candidates.sort((left, right) => left.vesselId.localeCompare(right.vesselId));
  return {
    state: candidates.length === 1 ? "matched" : candidates.length ? "ambiguous" : "unresolved",
    vesselId: candidates.length === 1 ? candidates[0].vesselId : null,
    candidates,
    query: structuredClone(requested),
  };
}

export function extractEvidenceCandidate({
  text,
  publishedAt = null,
  receivedAt,
  locations = [],
}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Evidence text is required.");
  requireTimestamp(receivedAt, "Evidence receipt time");
  if (publishedAt !== null) requireTimestamp(publishedAt, "Evidence publication time");

  const eventDate = extractEventDate(text);
  const location = extractDictionarySpan(text, locations);
  const activity = extractPatternSpan(text, ACTIVITY_PATTERNS);
  const status = extractPatternSpan(text, STATUS_PATTERNS);

  return {
    publicationTime: publishedAt,
    receivedAt,
    eventTime: eventDate?.value || null,
    locationCandidate: location,
    activityCandidate: activity,
    statusCandidate: status,
    citedSpans: [eventDate, location, activity, status].filter(Boolean),
  };
}

export function clusterEvidenceCandidates(candidates) {
  if (!Array.isArray(candidates)) throw new Error("Evidence clustering requires candidates.");
  const parent = candidates.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const join = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (sharesOrigin(candidates[left], candidates[right])) join(left, right);
    }
  }

  const groups = new Map();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(candidate);
  });

  return [...groups.values()]
    .map((items) => {
      const sorted = [...items].sort((left, right) => candidateId(left).localeCompare(candidateId(right)));
      return {
        clusterId: `ORIGIN_${sha256(sorted.map(candidateId).join("\n")).slice(0, 16)}`,
        representativeId: candidateId(sorted[0]),
        candidateIds: sorted.map(candidateId),
        duplicateCount: Math.max(0, sorted.length - 1),
        independentOriginCount: 1,
      };
    })
    .sort((left, right) => left.clusterId.localeCompare(right.clusterId));
}

export function findEvidenceContradictions(candidates) {
  if (!Array.isArray(candidates)) throw new Error("Contradiction detection requires candidates.");
  const byEvent = new Map();
  for (const candidate of candidates) {
    if (!candidate.vesselId) continue;
    const eventKey = candidate.eventTime ? String(candidate.eventTime).slice(0, 10) : "unknown-date";
    const key = `${candidate.vesselId}\u0000${eventKey}`;
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key).push(candidate);
  }

  const contradictions = [];
  for (const [key, items] of byEvent) {
    const locations = distinctValues(items, "location");
    const statuses = distinctValues(items, "status");
    if (locations.length <= 1 && statuses.length <= 1) continue;
    const [vesselId, eventDate] = key.split("\u0000");
    contradictions.push({
      vesselId,
      eventDate: eventDate === "unknown-date" ? null : eventDate,
      candidateIds: items.map(candidateId).sort(),
      fields: {
        location: locations.length > 1 ? locations : [],
        status: statuses.length > 1 ? statuses : [],
      },
      state: "requires-human-review",
    });
  }
  return contradictions.sort((left, right) =>
    `${left.vesselId}:${left.eventDate || ""}`.localeCompare(`${right.vesselId}:${right.eventDate || ""}`),
  );
}

export function gradeEvidenceCandidate(candidate, source) {
  const tierWeight = SOURCE_TIER_WEIGHT[source?.reliabilityTier] || 0;
  const direct = candidate.directness === "direct";
  const hasEventTime = Boolean(candidate.eventTime);
  const discoveryOnly = source?.category === "aggregator-discovery";
  let grade = "insufficient";
  if (!discoveryOnly && direct && hasEventTime && tierWeight >= SOURCE_TIER_WEIGHT.B) grade = "strong";
  else if (!discoveryOnly && direct && tierWeight >= SOURCE_TIER_WEIGHT.C) grade = "limited";
  return {
    grade,
    authorityTier: source?.reliabilityTier || "unknown",
    maximumPublicPrecision: maximumPublicPrecision(candidate, grade),
    publicationEligible: grade === "strong" && candidate.reviewState === "approved",
    reasons: [
      `source-tier:${source?.reliabilityTier || "unknown"}`,
      direct ? "direct-claim" : "indirect-or-unknown-claim",
      hasEventTime ? "event-time-supported" : "event-time-missing",
      discoveryOnly ? "discovery-only-source" : "evidence-source",
      candidate.reviewState === "approved" ? "human-approved" : "human-review-required",
    ],
  };
}

function maximumPublicPrecision(candidate, grade) {
  if (grade === "insufficient" || !candidate.location) return "none";
  if (grade === "limited") return "region";
  const supported = candidate.locationPrecision || candidate.publicPrecision || null;
  return ["region", "city", "port"].includes(supported) ? supported : "region";
}

export function validateModelSuggestion(suggestion, inputText) {
  if (!suggestion || typeof suggestion !== "object" || Array.isArray(suggestion)) {
    throw new Error("Model suggestion must be an object.");
  }
  if (typeof inputText !== "string") throw new Error("Model suggestion requires its input text.");
  const citations = Array.isArray(suggestion.citations) ? suggestion.citations : [];
  const fields = ["vesselId", "eventTime", "location", "activity", "status"];
  const value = {};
  for (const field of fields) {
    const proposed = suggestion[field] ?? null;
    if (proposed === null || proposed === "") {
      value[field] = null;
      continue;
    }
    const citation = citations.find((entry) => entry.field === field);
    if (!citation || !validCitation(citation, inputText)) {
      throw new Error(`Model suggestion ${field} lacks a valid cited input span.`);
    }
    value[field] = proposed;
  }
  return {
    schemaVersion: "1.0.0",
    suggestion: value,
    citations: citations.map((entry) => structuredClone(entry)),
    publicationEligible: false,
    requiresHumanReview: true,
  };
}

export function createEvidenceReviewQueues({ candidates, sources, asOf, staleAfterDays = 30 }) {
  requireTimestamp(asOf, "Review queue time");
  const sourceById = new Map((sources || []).map((source) => [source.sourceId, source]));
  const contradictions = findEvidenceContradictions(candidates);
  const contradictoryIds = new Set(contradictions.flatMap((entry) => entry.candidateIds));
  const queues = {
    new: [],
    stale: [],
    contradictory: [],
    unmatched: [],
    lowSupport: [],
  };
  for (const candidate of candidates) {
    const id = candidateId(candidate);
    const matched = candidate.match?.state === "matched" || Boolean(candidate.vesselId);
    const grade = gradeEvidenceCandidate(candidate, sourceById.get(candidate.sourceId));
    if (candidate.reviewState === "new") queues.new.push(id);
    if (!matched) queues.unmatched.push(id);
    if (contradictoryIds.has(id)) queues.contradictory.push(id);
    if (grade.grade !== "strong") queues.lowSupport.push(id);
    const referenceTime = candidate.eventTime || candidate.publishedAt || candidate.receivedAt;
    if (!referenceTime || ageDays(referenceTime, asOf) > staleAfterDays) queues.stale.push(id);
  }
  for (const key of Object.keys(queues)) queues[key] = [...new Set(queues[key])].sort();
  return { generatedAt: asOf, queues, contradictions };
}

function compareIdentifier(requested, actual, field, explanations) {
  if (requested && actual && normalise(requested) === normalise(actual)) {
    explanations.push({ field, requested, matched: actual });
  }
}

function extractEventDate(text) {
  const iso = /\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/.exec(text);
  if (iso) return createSpan("eventTime", `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`, iso, text);
  const named = /\b([0-2]?\d|3[01])\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i.exec(text);
  if (!named) return null;
  const day = Number(named[1]);
  const month = MONTHS[named[2].toLowerCase()];
  const year = Number(named[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null;
  }
  return createSpan("eventTime", date.toISOString(), named, text);
}

function extractDictionarySpan(text, values) {
  const matches = values
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => ({ value: value.trim(), index: text.toLocaleLowerCase("en-GB").indexOf(value.trim().toLocaleLowerCase("en-GB")) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index || right.value.length - left.value.length);
  if (!matches.length) return null;
  const match = matches[0];
  return {
    field: "location",
    value: match.value,
    start: match.index,
    end: match.index + match.value.length,
    text: text.slice(match.index, match.index + match.value.length),
  };
}

function extractPatternSpan(text, patterns) {
  const matches = patterns
    .map(([value, pattern]) => ({ value, match: pattern.exec(text) }))
    .filter((entry) => entry.match)
    .sort((left, right) => left.match.index - right.match.index);
  if (!matches.length) return null;
  const { value, match } = matches[0];
  return createSpan(patterns === ACTIVITY_PATTERNS ? "activity" : "status", value, match, text);
}

function createSpan(field, value, match, text) {
  return {
    field,
    value,
    start: match.index,
    end: match.index + match[0].length,
    text: text.slice(match.index, match.index + match[0].length),
  };
}

function sharesOrigin(left, right) {
  if (left.contentHash && left.contentHash === right.contentHash) return true;
  if (left.originId && left.originId === right.originId) return true;
  if (left.commonOriginUrl && canonicalUrl(left.commonOriginUrl) === canonicalUrl(right.commonOriginUrl)) return true;
  if (left.canonicalUrl && right.canonicalUrl && canonicalUrl(left.canonicalUrl) === canonicalUrl(right.canonicalUrl)) return true;
  return false;
}

function canonicalUrl(value) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function distinctValues(items, field) {
  return [...new Set(items.map((item) => normalise(item[field])).filter(Boolean))].sort();
}

function candidateId(candidate) {
  const id = candidate.candidateId || candidate.evidenceId;
  if (typeof id !== "string" || !id.trim()) throw new Error("Evidence candidate has no identifier.");
  return id;
}

function validCitation(citation, text) {
  return Number.isInteger(citation.start) &&
    Number.isInteger(citation.end) &&
    citation.start >= 0 &&
    citation.end > citation.start &&
    citation.end <= text.length &&
    citation.quote === text.slice(citation.start, citation.end);
}

function ageDays(value, asOf) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.parse(asOf) - time) / 86_400_000);
}

function normalise(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLocaleLowerCase("en-GB");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}
