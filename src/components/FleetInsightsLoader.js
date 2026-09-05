import {
  parseStatusHistory,
  parsePhysicalStatusHistory,
  validatePublicationChanges,
  validateStatusHistoryCatalog,
} from "../utils/insights.js";
import { readReleaseMetadata, releaseRevision } from "../utils/release.js";
import { parseLocationHistory } from "../utils/location-history.js";

export class FleetInsightsLoader {
  constructor({ changesUrl, historyUrl, historyCatalogUrl, locationHistoryUrl }) {
    this.changesUrl = changesUrl;
    this.historyUrl = historyUrl;
    this.historyCatalogUrl = historyCatalogUrl;
    this.locationHistoryUrl = locationHistoryUrl;
  }

  async load() {
    const [changesResponse, historyResponse, historyCatalogResponse, locationResponse] = await Promise.all([
      fetch(this.changesUrl),
      fetch(this.historyUrl),
      fetch(this.historyCatalogUrl),
      fetch(this.locationHistoryUrl),
    ]);
    if (!changesResponse.ok || !historyResponse.ok || !historyCatalogResponse.ok || !locationResponse.ok) {
      throw new Error("Fleet insight data could not be loaded.");
    }
    const historyText = await historyResponse.text();
    const history = parseStatusHistory(historyText);
    const historyCatalog = validateStatusHistoryCatalog(await historyCatalogResponse.json(), history);
    const locationHistory = parseLocationHistory(
      await locationResponse.text(), parsePhysicalStatusHistory(historyText), historyCatalog,
    );
    return {
      changes: validatePublicationChanges(await changesResponse.json()),
      history,
      historyCatalog,
      locationHistory,
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
