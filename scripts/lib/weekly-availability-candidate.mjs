import { parsePhysicalAvailabilityHistory } from "../../src/utils/availability-history.js";
import { compareReleaseIdentity } from "../../src/utils/release.js";

export function decideWeeklyAvailabilityCandidate({ candidateText, existingText = "", weekEnding }) {
  const candidateRecords = parsePhysicalAvailabilityHistory(candidateText);
  const candidate = candidateRecords.at(-1);
  if (!candidate || candidate.weekEnding !== weekEnding) {
    throw new Error("The validated candidate must end with the requested availability week.");
  }

  if (!existingText.trim()) return { action: "create", candidate };

  const existingRecords = parsePhysicalAvailabilityHistory(existingText);
  const existing = existingRecords.filter((record) => record.weekEnding === weekEnding).at(-1);
  if (!existing) {
    throw new Error("The existing automation branch does not contain its named availability week.");
  }

  const releaseComparison = compareReleaseIdentity(
    sourceIdentity(candidate.sourceRelease),
    sourceIdentity(existing.sourceRelease),
  );
  if (releaseComparison < 0) {
    throw new Error("The validated candidate is stale relative to the open weekly candidate.");
  }
  if (releaseComparison === 0) {
    if (
      candidate.sourceRelease.releasedAt !== existing.sourceRelease.releasedAt ||
      JSON.stringify(candidate.observations) !== JSON.stringify(existing.observations)
    ) {
      throw new Error("The same reviewed release produced conflicting weekly candidates.");
    }
    return { action: "noop", candidate, existing };
  }

  if (new Date(candidate.recordedAt).valueOf() <= new Date(existing.recordedAt).valueOf()) {
    throw new Error("A corrected weekly candidate must have a later recording instant.");
  }
  return { action: "replace", candidate, existing };
}

export function selectOpenWeeklyCandidate({
  openPullRequests,
  title,
  canonicalBranch,
  weekEnding,
}) {
  if (!Array.isArray(openPullRequests)) throw new Error("Open pull-request data must be an array.");
  const matches = openPullRequests.filter((pullRequest) => pullRequest.title === title);
  if (matches.length > 1) {
    throw new Error(`Multiple open candidates exist for ${weekEnding}; refusing to choose between them.`);
  }
  if (matches.length === 0) return { branch: canonicalBranch, url: null };

  const match = matches[0];
  const legacyBranchPattern = new RegExp(`^${escapeRegex(canonicalBranch)}-[0-9]+$`);
  if (
    match.isCrossRepository !== false ||
    (match.headRefName !== canonicalBranch && !legacyBranchPattern.test(match.headRefName))
  ) {
    throw new Error(
      "The matching pull request does not use a trusted same-repository automation branch.",
    );
  }
  return { branch: match.headRefName, url: match.url };
}

export function inspectPushedWeeklyCandidate({
  openPullRequests,
  title,
  canonicalBranch,
  pushedSha,
}) {
  if (!Array.isArray(openPullRequests)) throw new Error("Open pull-request data must be an array.");
  if (!/^[a-f0-9]{40}$/.test(pushedSha || "")) {
    throw new Error("The validated pushed candidate SHA is invalid.");
  }
  const relevant = openPullRequests.filter(
    (pullRequest) =>
      pullRequest.title === title || pullRequest.headRefName === canonicalBranch,
  );
  if (relevant.length === 0) return { state: "none", url: null };
  if (relevant.length > 1) {
    throw new Error("Ambiguous open pull requests appeared for the pushed weekly candidate.");
  }

  const match = relevant[0];
  if (
    match.isCrossRepository !== false ||
    match.title !== title ||
    match.headRefName !== canonicalBranch ||
    match.headRefOid !== pushedSha ||
    typeof match.url !== "string" ||
    !match.url
  ) {
    throw new Error(
      "The open pull request for the pushed weekly candidate is mismatched or points elsewhere.",
    );
  }
  return { state: "matching", url: match.url };
}

function sourceIdentity(sourceRelease) {
  return {
    asOfDate: sourceRelease.snapshotDate,
    releaseRevision: sourceRelease.releaseRevision,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
