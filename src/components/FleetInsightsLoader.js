import { parseStatusHistory, validatePublicationChanges } from "../utils/insights.js";

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

export function insightsMatchDataset(insights, asOfDate) {
  if (!insights || typeof asOfDate !== "string") return false;
  const latestSnapshot = insights.history?.at(-1);
  return (
    insights.changes?.currentAsOfDate === asOfDate &&
    latestSnapshot?.snapshotDate === asOfDate
  );
}
