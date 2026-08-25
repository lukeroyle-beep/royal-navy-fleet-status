import {
  parseStatusHistory,
  validatePublicationChanges,
  validateStatusHistoryCatalog,
} from "../utils/insights.js";
import { readReleaseMetadata, releaseRevision } from "../utils/release.js";

export class FleetInsightsLoader {
  constructor({ changesUrl, historyUrl, historyCatalogUrl }) {
    this.changesUrl = changesUrl;
    this.historyUrl = historyUrl;
    this.historyCatalogUrl = historyCatalogUrl;
  }

  async load() {
    const [changesResponse, historyResponse, historyCatalogResponse] = await Promise.all([
      fetch(this.changesUrl),
      fetch(this.historyUrl),
      fetch(this.historyCatalogUrl),
    ]);
    if (!changesResponse.ok || !historyResponse.ok || !historyCatalogResponse.ok) {
      throw new Error("Fleet insight data could not be loaded.");
    }
    const history = parseStatusHistory(await historyResponse.text());
    return {
      changes: validatePublicationChanges(await changesResponse.json()),
      history,
      historyCatalog: validateStatusHistoryCatalog(await historyCatalogResponse.json(), history),
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
