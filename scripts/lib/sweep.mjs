export function createSweepQueue(registry, asOf) {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error("Sweep queue requires an ISO timestamp.");
  return {
    schemaVersion: "1.0.0",
    generatedAt: asOf,
    collectionBoundary: "Collection is outside page requests. Manual sources require analyst review; APIs require credentials and an approved terms record.",
    sources: registry.sources
      .filter((source) => source.enabled)
      .map((source) => ({
        sourceId: source.sourceId,
        vesselId: source.vesselId || null,
        category: source.category,
        canonicalUrl: source.canonicalUrl,
        accountHandle: source.accountHandle || null,
        collectionMode: source.collectionMode,
        manualReviewRequired: source.collectionMode === "manual",
        promotionPolicy:
          source.category === "aggregator-discovery" ? "discovery-only" : "evidence-requires-temporal-and-origin-review",
      }))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  };
}
