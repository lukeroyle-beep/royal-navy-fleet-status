import { parseStatusHistory, validatePublicationChanges } from "../utils/insights.js";
import { readReleaseMetadata, releaseRevision } from "../utils/release.js";

export class FleetInsightsLoader {
  constructor({ changesUrl, historyUrl }) {
    this.changesUrl = changesUrl;
    this.historyUrl = historyUrl;
  }

  async load() {
    const [changesResponse, historyResponse] = await Promise.all([
      fetch(this.changesUrl),
      fetch(this.historyUrl),
    ]);
    if (!changesResponse.ok || !historyResponse.ok) {
      throw new Error("Fleet insight data could not be loaded.");
    }
    return {
      changes: validatePublicationChanges(await changesResponse.json()),
      history: parseStatusHistory(await historyResponse.text()),
    };
  }
}

export function insightsMatchDataset(insights, metadata) {
  if (!insights) return false;
  let release;
  try {
    release = readReleaseMetadata(
      typeof metadata === "string" ? { asOfDate: metadata } : metadata,
    );
  } catch {
    return false;
  }
  const latestSnapshot = insights.history?.at(-1);
  return (
    insights.changes?.currentAsOfDate === release.asOfDate &&
    (insights.changes?.currentReleaseRevision ?? 1) === release.releaseRevision &&
    (insights.changes?.currentReleasedAt ?? null) === release.releasedAt &&
    latestSnapshot?.snapshotDate === release.asOfDate &&
    releaseRevision(latestSnapshot) === release.releaseRevision &&
    (latestSnapshot?.releasedAt ?? null) === release.releasedAt
  );
}
