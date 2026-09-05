import { expect, test } from "@playwright/test";
import fs from "node:fs";

import { formatPublicationChangeLabels } from "../../src/utils/release.js";

const fleet = JSON.parse(
  fs.readFileSync(new URL("../../data/royal-navy/vessels.json", import.meta.url), "utf8"),
);
const publicationChanges = JSON.parse(
  fs.readFileSync(
    new URL("../../data/royal-navy/publication-changes.json", import.meta.url),
    "utf8",
  ),
);
const shore = JSON.parse(
  fs.readFileSync(
    new URL("../../data/royal-navy/shore-establishments.json", import.meta.url),
    "utf8",
  ),
);
const historicalSnapshotDate = "2026-08-12";
const expectedHistoricalMarkers = JSON.parse(fs.readFileSync(new URL("../../scripts/fixtures/historical-location-markers.json", import.meta.url), "utf8"));

async function expectCompleteMarkerNames(page, names) {
  await expect.poll(() => page.locator(".fleet-marker").evaluateAll(markers => markers.map(marker => marker.title).sort()))
    .toEqual(names.slice().sort());
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#asOfDate")).not.toHaveText("Loading");
  await expect(page.locator("#loadError")).toBeHidden();
});

test("Compare renders every change in the current publication artifact", async ({ page }) => {
  const expectedNames = publicationChanges.changes.map((change) => change.vesselName);
  const currentVesselIds = new Set(fleet.vessels.map((vessel) => vessel.id));
  const expectedCurrentIds = publicationChanges.changes
    .map((change) => change.vesselId)
    .filter((vesselId) => currentVesselIds.has(vesselId))
    .sort();
  const labels = formatPublicationChangeLabels(publicationChanges);

  await expect(page.locator("#changesToggle")).toBeVisible();
  await expect(page.locator("#changesCount")).toHaveText(
    publicationChanges.changes.length.toString(),
  );

  await page.locator("#changesToggle").click();
  await expect(page.locator("#changesPanel")).toBeVisible();
  await expect(page.locator("#changesSummary")).toHaveText(labels.summary);
  await expect(page.locator("#changesList li")).toHaveCount(publicationChanges.changes.length);
  await expect(page.locator("#changesList li span")).toHaveText(expectedNames);

  await page.locator("#changedOnlyToggle").check();
  const renderedVesselIds = await page
    .locator("#vesselList button[data-vessel-id]")
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.vesselId).sort());
  expect(renderedVesselIds).toEqual(expectedCurrentIds);
});

test("Compare retains a location-only publication change", async ({ page }) => {
  const protector = fleet.vessels.find((vessel) => vessel.id === "hms-protector");
  const locationOnlyChanges = {
    ...publicationChanges,
    counts: { status: 0, location: 1, mapping: 0, marker: 0, evidence: 0 },
    changes: [
      {
        vesselId: protector.id,
        vesselName: protector.name,
        categories: ["location"],
        items: [
          {
            kind: "location",
            label: "Location",
            before: "Previous reviewed public location",
            after: protector.lastReportedLocation,
          },
        ],
      },
    ],
  };

  await page.route("**/data/royal-navy/publication-changes.json", async (route) => {
    await route.fulfill({ json: locationOnlyChanges });
  });
  await page.reload();
  await expect(page.locator("#asOfDate")).not.toHaveText("Loading");
  await expect(page.locator("#loadError")).toBeHidden();

  await expect(page.locator("#changesCount")).toHaveText("1");
  await page.locator("#changesToggle").click();
  await expect(page.locator("#changesList li")).toHaveCount(1);
  await expect(page.locator("#changesList li span")).toHaveText([protector.name]);
  await page.locator("#changedOnlyToggle").check();
  await expect(page.locator("#vesselList button[data-vessel-id]"))
    .toHaveAttribute("data-vessel-id", protector.id);
});

test("every current class keeps its list and point-marker counts aligned", async ({ page }) => {
  await openAssets(page);
  await page.locator("#layersToggle").click();
  await expect(page.locator("#layersPanel")).toBeVisible();
  await page.locator("#clusterLayerToggle").uncheck();
  await page.locator("#filterToggle").click();
  await expect(page.locator("#filterPanel")).toBeVisible();
  await expect(page.locator("#layersPanel")).toBeHidden();
  await expect(page.locator("#fleetDrawer")).toBeVisible();

  const classes = [...new Set(fleet.vessels.map((vessel) => vessel.vesselClass))];
  for (const vesselClass of classes) {
    const records = fleet.vessels.filter((vessel) => vessel.vesselClass === vesselClass);
    const expectedMarkers = records.filter((vessel) => vessel.position).length;
    await page.locator(classButtonSelector(vesselClass)).click();
    await expect(page.locator("#filterResultStatus")).toContainText(
      `Showing ${records.length} of ${fleet.vessels.length} vessels`,
    );
    await expect(page.locator("#classMapSummary")).toHaveText(
      `Map: ${expectedMarkers} point-mapped · ${records.length - expectedMarkers} regional or list-only.`,
    );
    await expect.poll(() => page.locator(".fleet-marker").count()).toBe(expectedMarkers);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("class"))
      .toBe(vesselClass);

    if (expectedMarkers === 0) {
      await expect(page.locator("#mapFilterNotice")).toHaveText(
        "No point locations are publishable for this filter. Regional and list-only records remain in the fleet list.",
      );
    } else {
      await expect(page.locator("#mapFilterNotice")).toBeHidden();
    }
  }

  const combinedClass = "Vanguard class";
  const combinedStatus = "Deployed";
  const combinedRecords = fleet.vessels.filter(
    (vessel) => vessel.vesselClass === combinedClass && vessel.status === combinedStatus,
  );
  const combinedMarkers = combinedRecords.filter((vessel) => vessel.position).length;
  await page.locator(classButtonSelector(combinedClass)).click();
  await page.locator("#statusFilter").selectOption(combinedStatus);
  await expect(page.locator("#classMapSummary")).toHaveText(
    `Map: ${combinedMarkers} point-mapped · ${combinedRecords.length - combinedMarkers} regional or list-only.`,
  );
  await expect.poll(() => page.locator(".fleet-marker").count()).toBe(combinedMarkers);
  await expect(page.locator("#mapFilterNotice")).toBeVisible();
});

test("valid empty location states survive reload and browser history", async ({ page }) => {
  for (const locationState of ["unconfirmed", "no_recent_information"]) {
    await page.goto(`/?view=2&locationState=${locationState}&layers=fleet,clusters`);
    await expect(page.locator("#locationFilter")).toHaveValue(locationState);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("locationState"))
      .toBe(locationState);
    await page.reload();
    await expect(page.locator("#locationFilter")).toHaveValue(locationState);
  }

  await page.goto("/?view=2&locationState=unconfirmed&layers=fleet,clusters");
  await page.goto("/?view=2&locationState=no_recent_information&layers=fleet,clusters");
  await page.goBack();
  await expect(page.locator("#locationFilter")).toHaveValue("unconfirmed");
  await page.goForward();
  await expect(page.locator("#locationFilter")).toHaveValue("no_recent_information");
});

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test(`historical locations isolate dates and preserve current view at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/?view=2&layers=fleet&snapshot=2026-07-31");
    await openAssets(page);
    await expect(page.locator("#publicationFreshness")).toHaveText("Historical public snapshot");
    await expect(page.locator("#plotResultStatus")).toContainText("20 point-mapped");
    await expect(page.locator(".fleet-marker")).toHaveCount(20);
    await expectCompleteMarkerNames(page, expectedHistoricalMarkers["2026-07-31"].points.map(p => p.name));
    await page.locator("#snapshotSelect").selectOption(historicalSnapshotDate);
    await expect(page.locator("#plotResultStatus")).toContainText("31 point-mapped");
    await expect(page.locator(".fleet-marker")).toHaveCount(31);
    await expectCompleteMarkerNames(page, expectedHistoricalMarkers[historicalSnapshotDate].points.map(p => p.name));
    await page.reload();
    await expect(page.locator("#snapshotSelect")).toHaveValue(historicalSnapshotDate);
    await expect(page.locator(".fleet-marker")).toHaveCount(31);
    await openAssets(page);
    await page.locator("#searchInput").fill("HMS Victory");
    await page.locator('#vesselList button[data-vessel-id="hms-victory"]').click();
    await expect(page.locator("#detailCard")).toContainText("Portsmouth");
    await expect(page.locator(".fleet-marker.is-selected")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`rn-historical-${viewport.width}.png`) });
    await page.getByRole("button", { name: "Close selected record", exact: true }).click();
    await openAssets(page);
    await page.locator("#searchInput").fill("HMS Vengeance");
    await page.locator('#vesselList button[data-vessel-id="hms-vengeance"]').click();
    await expect(page.locator("#detailCard")).toContainText("Not available for this snapshot");
    await expect(page.locator(".fleet-marker")).toHaveCount(0);
    await page.getByRole("button", { name: "Close selected record", exact: true }).click();
    await openAssets(page);
    await page.locator("#searchInput").fill("");
    await page.locator("#snapshotSelect").selectOption("2026-08-23");
    await expect(page.locator(".fleet-marker")).toHaveCount(37);
    await expectCompleteMarkerNames(page, expectedHistoricalMarkers["2026-08-23"].points.map(p => p.name));
    await expect(page.locator("#vesselList button[data-vessel-id]")).toHaveCount(68);
    await expect(page.locator('#vesselList button[data-vessel-id="hms-iron-duke"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator("#snapshotSelect")).toHaveValue("2026-08-23");
    await expect(page.locator(".fleet-marker")).toHaveCount(37);
    await openAssets(page);
    await page.locator("#snapshotSelect").selectOption(fleet.metadata.asOfDate);
    await expect(page.locator(".fleet-marker")).toHaveCount(fleet.vessels.filter(v => v.position).length);
    await expectCompleteMarkerNames(page, fleet.vessels.filter(v => v.position).map(v => v.name));
    await expect(page.locator("#loadError")).toBeHidden();
  });
}

test("desktop right-side panels are exclusive and list selections explain map display", async ({ page }) => {
  await openAssets(page);
  await page.locator("#filterToggle").click();
  await expect(page.locator("#filterPanel")).toBeVisible();

  await page.locator("#layersToggle").click();
  await expect(page.locator("#layersPanel")).toBeVisible();
  await expect(page.locator("#filterPanel")).toBeHidden();
  await expect(page.locator("#fleetDrawer")).toBeVisible();

  await page.locator("#clusterLayerToggle").uncheck();
  await page.locator("#fleetLayerToggle").uncheck();
  const pointMappedVessel = fleet.vessels.find((vessel) => vessel.position);
  const pointMappedListButton = page.locator(
    `#vesselList button[data-vessel-id=${JSON.stringify(pointMappedVessel.id)}]`,
  );
  await pointMappedListButton.click();
  await expect(page.locator("#detailDrawer")).toBeVisible();
  await expect(page.locator("#layersPanel")).toBeHidden();
  await expect(pointMappedListButton)
    .toHaveClass(/is-selected/);
  await expect(page.locator("#detailMeta")).toContainText("Map display");
  await expect(page.locator("#detailMeta")).toContainText(
    "Point-mapped record — marker shown when fleet layer is enabled",
  );

  await page.locator("#filterToggle").click();
  await expect(page.locator("#filterPanel")).toBeVisible();
  await expect(page.locator("#detailDrawer")).toBeHidden();
  const visibleRightPanels = await page
    .locator("#detailDrawer, #layersPanel, #filterPanel, #changesPanel")
    .evaluateAll((panels) => panels.filter((panel) => !panel.hidden).length);
  expect(visibleRightPanels).toBe(1);

  await page.locator(classButtonSelector("Vanguard class")).click();
  await page.locator("#classAvailabilityPanel > summary").click();
  const classVesselButton = page.locator("#classAvailabilityVessels button").first();
  await classVesselButton.click();
  await expect(page.locator("#detailDrawer")).toBeVisible();
  await expect(page.locator("#filterPanel")).toBeHidden();
  await page.locator('[data-close-surface="detail"]').click();
  await expect(page.locator("#filterPanel")).toBeVisible();
  await expect(classVesselButton).toBeFocused();
});

test("the operational banner is derived from the dataset and works as a filter", async ({ page }) => {
  const expected = {
    deployed: fleet.vessels.filter((vessel) => vessel.status === "Deployed").length,
    available: fleet.vessels.filter((vessel) => vessel.status === "Available").length,
    inRefit: fleet.vessels.filter((vessel) => vessel.status === "In re-fit").length,
    unknown: fleet.vessels.filter((vessel) => vessel.status === "Unknown").length,
    classified: fleet.vessels.filter((vessel) => vessel.locationState === "withheld").length,
  };

  await expect(page.locator("#mapTitle")).toHaveText("British Armed Forces Tracker");
  await expect(page.locator("#deployedCount")).toHaveText(String(expected.deployed));
  await expect(page.locator("#availableCount")).toHaveText(String(expected.available));
  await expect(page.locator("#refitCount")).toHaveText(String(expected.inRefit));
  await expect(page.locator("#unknownCount")).toHaveText(String(expected.unknown));
  await expect(page.locator("#classifiedCount")).toHaveText(String(expected.classified));

  await page.locator('[data-summary-filter="Available"]').click();
  await expect(page.locator("#statusFilter")).toHaveValue("Available");
  await expect(page.locator("#vesselList button[data-vessel-id]")).toHaveCount(expected.available);
  await expect(page.getByRole("button", { name: "Remove Status: Available" })).toBeVisible();

  await page.locator('[data-summary-location="withheld"]').click();
  await expect(page.locator("#statusFilter")).toHaveValue("Available");
  await expect(page.locator("#locationFilter")).toHaveValue("withheld");
  await expect(page.getByRole("button", { name: "Remove Status: Available" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Location: Location not published" })).toBeVisible();
  await expect(page.locator("#vesselList button[data-vessel-id]")).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBe("Available");
  await expect.poll(() => new URL(page.url()).searchParams.get("locationState")).toBe("withheld");

  await page.locator('[data-summary-location="withheld"]').click();
  await expect(page.locator("#locationFilter")).toHaveValue("");
  await expect(page.locator("#statusFilter")).toHaveValue("Available");
  await expect(page.locator("#vesselList button[data-vessel-id]")).toHaveCount(expected.available);
  await page.getByRole("button", { name: "Remove Status: Available" }).click();
  await expect(page.locator("#statusFilter")).toHaveValue("");
  await expect(page.locator("#vesselList button[data-vessel-id]")).toHaveCount(fleet.vessels.length);
});

test("vessel selection exposes the complete card and survives browser history", async ({ page }) => {
  const duncan = fleet.vessels.find((vessel) => vessel.id === "hms-duncan");
  await page.locator("#searchInput").fill(duncan.name);
  const result = page.locator(`#vesselList button[data-vessel-id=${JSON.stringify(duncan.id)}]`);
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator("#detailDrawer")).toBeVisible();
  await expect(page.locator("#detailKind")).toHaveText(`${duncan.service} · ${duncan.pennantNumber}`);
  await expect(page.locator("#detailTitle")).toHaveText(duncan.name);
  await expect(page.locator("#detailClassLine")).toHaveText(`${duncan.vesselClass} · ${duncan.vesselType}`);
  for (const [term, value] of [
    ["status", duncan.status],
    ["location", duncan.publicLocationLabel],
    ["class", duncan.vesselClass],
    ["type", duncan.vesselType],
    ["pennant", duncan.pennantNumber],
    ["commission-date", duncan.commissionedDate],
    ["home-port", duncan.homePort],
    ["precision", "Port-level location"],
    ["snapshot", "31 Aug 2026"],
  ]) {
    const entry = page.locator(`#detailPrimaryMeta [data-term=${JSON.stringify(term)}]`);
    await expect(entry).toBeVisible();
    await expect(entry.locator("dd")).toHaveText(value);
  }
  const photo = page.locator("#detailPhotoImage");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute("src", /photos\/duncan\.jpg$/);
  await expect.poll(() => photo.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator("#fleetMap")).toHaveClass(/has-selection/);
  await expect(page.locator(".fleet-marker.is-selected")).toHaveCount(1);
  await expect(result).toHaveAttribute("aria-current", "true");
  await expect.poll(() => new URL(page.url()).searchParams.get("vessel")).toBe(duncan.id);

  await page.goBack();
  await expect(page.locator("#detailDrawer")).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get("vessel")).toBeNull();
  await page.goForward();
  await expect(page.locator("#detailTitle")).toHaveText(duncan.name);
  await expect.poll(() => new URL(page.url()).searchParams.get("vessel")).toBe(duncan.id);
});

test("unified search selects a shore establishment with its photograph and hierarchy", async ({ page }) => {
  const devonport = shore.establishments.find((establishment) => establishment.id === "hmnb-devonport");
  await page.locator("#searchInput").fill(devonport.name);
  const result = page.locator(
    `#unifiedShoreList button[data-establishment-id=${JSON.stringify(devonport.id)}]`,
  );
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator("#detailTitle")).toHaveText(devonport.name);
  await expect(page.locator("#detailClassLine")).toHaveText(devonport.location);
  await expect(page.locator('#detailPrimaryMeta [data-term="type"] dd')).toHaveText(devonport.type);
  await expect(page.locator('#detailPrimaryMeta [data-term="location"] dd')).toHaveText(devonport.location);
  await expect(page.locator('#detailPrimaryMeta [data-term="role"] dd')).toHaveText(devonport.role);
  await expect(page.locator("#detailPhotoImage")).toBeVisible();
  await expect(page.locator("#detailPhotoCredit")).toBeVisible();
  await expect(result).toHaveAttribute("aria-current", "true");
  await expect(page.locator('button[data-vessel-id][aria-current="true"]')).toHaveCount(0);
  await expect.poll(() =>
    page.locator('button[data-establishment-id][aria-current="true"]').count(),
  ).toBeGreaterThan(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("shore")).toBe(devonport.id);
});

test("shore filters remain removable while selected search results stay visible", async ({ page }) => {
  const devonport = shore.establishments.find((establishment) => establishment.id === "hmnb-devonport");
  const excludedType = "Air station";
  const expectedFilteredMarkers = shore.establishments.filter(
    (establishment) => establishment.type === excludedType,
  ).length;

  await page.locator("#layersToggle").click();
  await page.locator("#shoreLayerToggle").check();
  await page.locator("#clusterLayerToggle").uncheck();
  await page.locator("#shoreTypeFilter").selectOption(excludedType);
  await expect(page.getByRole("button", { name: `Remove Shore type: ${excludedType}` })).toBeVisible();
  await expect.poll(() => page.locator(".shore-marker").count()).toBe(expectedFilteredMarkers);

  await page.locator("#searchInput").fill(devonport.name);
  await page
    .locator(`#unifiedShoreList button[data-establishment-id=${JSON.stringify(devonport.id)}]`)
    .click();

  await expect(page.locator("#detailTitle")).toHaveText(devonport.name);
  await expect(page.locator("#shoreTypeFilter")).toHaveValue(excludedType);
  await expect(page.locator(".shore-marker.is-selected")).toHaveCount(1);
  await expect(page.locator(".shore-marker")).toHaveCount(expectedFilteredMarkers + 1);
  await expect.poll(() => new URL(page.url()).searchParams.get("shoreType")).toBe(excludedType);
  await expect.poll(() => new URL(page.url()).searchParams.get("shore")).toBe(devonport.id);
});

test("compact active-filter controls clear shore filters above an open sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#asOfDate")).not.toHaveText("Loading");

  await page.locator("#layersToggle").click();
  await page.locator("#shoreLayerToggle").check();
  await page.locator("#shoreSearchInput").fill("Yeovilton");
  await page.locator("#shoreTypeFilter").selectOption("Air station");

  await expect(page.locator("#surfaceBackdrop")).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove Shore search: Yeovilton" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Shore type: Air station" })).toBeVisible();
  await expect(page.locator("#filterBadge")).toHaveText("2");
  await expect(page.locator("#filterResultStatus")).toHaveText(`Showing ${fleet.vessels.length} vessels`);

  await page.getByRole("button", { name: "Remove Shore type: Air station" }).click();
  await expect(page.locator("#shoreTypeFilter")).toHaveValue("");
  await expect(page.locator("#shoreSearchInput")).toHaveValue("Yeovilton");
  await page.locator("#clearActiveFilters").click();
  await expect(page.locator("#shoreSearchInput")).toHaveValue("");
  await expect(page.locator("#shoreTypeFilter")).toHaveValue("");
  await expect(page.locator("#activeFilterBar")).toBeHidden();
  await expect(page.locator("#filterBadge")).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get("shoreQ")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get("shoreType")).toBeNull();
});

test("clusters disclose their contents and all shore categories retain their markers", async ({ page }) => {
  const firstCluster = page.locator(".fleet-cluster").first();
  await expect(firstCluster).toBeVisible();
  await firstCluster.click();
  await expect(page.locator("#clusterResults")).toBeVisible();
  await expect(page.locator("#clusterResultList li")).not.toHaveCount(0);

  await page.locator("#layersToggle").click();
  await page.locator("#shoreLayerToggle").check();
  await page.locator("#clusterLayerToggle").uncheck();
  for (const type of [...new Set(shore.establishments.map((establishment) => establishment.type))]) {
    const expectedCount = shore.establishments.filter((establishment) => establishment.type === type).length;
    await page.locator("#shoreTypeFilter").selectOption(type);
    await expect(page.locator("#shoreEstablishmentList button")).toHaveCount(expectedCount);
    await expect.poll(() => page.locator(".shore-marker").count()).toBe(expectedCount);
  }
});

test("the text table, empty state and missing-image fallback remain usable", async ({ page }) => {
  await openAssets(page);
  await page.locator("#tableViewToggle").click();
  await expect(page.locator("#fleetTableWrap")).toBeVisible();
  await expect(page.locator("#fleetTableBody tr")).toHaveCount(fleet.vessels.length);

  await page.locator("#searchInput").fill("No matching public asset");
  await expect(page.locator("#fleetEmptyState")).toBeVisible();
  await expect(page.locator("#fleetTableBody tr")).toHaveCount(0);
  await page.locator("#resetFilters").click();

  await page.route("**/photos/duncan.jpg", (route) => route.abort());
  await page.locator("#searchInput").fill("HMS Duncan");
  await page.locator('#fleetTableBody button[data-vessel-id="hms-duncan"]').click();
  const photoFallback = page.getByRole("img", { name: "Photograph unavailable" });
  await expect(photoFallback).toBeVisible();
  await expect(photoFallback).toContainText("Photograph unavailable");
});

test("compact interactive controls retain 44 pixel touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#asOfDate")).not.toHaveText("Loading");
  await page.locator('[data-summary-filter="Available"]').click();
  await openAssets(page);
  await page.locator("#tableViewToggle").click();

  for (const selector of [
    ".fleet-summary-banner button",
    ".rail-button:visible",
    "#resetMap",
    "#activeFilterChips button",
    "#clearActiveFilters",
    "#fleetDrawer .surface-close",
    "#resetFilters",
    ".result-view-toggle button",
    "#fleetTable button",
  ]) {
    const controls = page.locator(selector);
    await expect(controls.first(), `${selector} should have a visible target`).toBeVisible();
    const targets = await controls.evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getClientRects().length)
        .map((node) => {
          const { width, height } = node.getBoundingClientRect();
          return { width, height };
        }),
    );
    expect(targets.length, `${selector} should expose at least one visible target`).toBeGreaterThan(0);
    expect(
      Math.min(...targets.map(({ width }) => width)),
      `${selector} should meet the 44px touch-target width minimum`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      Math.min(...targets.map(({ height }) => height)),
      `${selector} should meet the 44px touch-target height minimum`,
    ).toBeGreaterThanOrEqual(44);
  }
});

test("loading, partial insight and malformed-data states are explicit", async ({ page }) => {
  let releaseFleetRequest;
  const fleetGate = new Promise((resolve) => {
    releaseFleetRequest = resolve;
  });
  await page.route("**/data/royal-navy/vessels.json", async (route) => {
    await fleetGate;
    await route.continue();
  });
  const loadingReload = page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#loadingState")).toBeVisible();
  releaseFleetRequest();
  await loadingReload;
  await expect(page.locator("#loadingState")).toBeHidden();
  await page.unroute("**/data/royal-navy/vessels.json");

  await page.route("**/data/royal-navy/publication-changes.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.reload();
  await expect(page.locator("#dataHealthNotice")).toHaveText(
    "Fleet snapshot loaded. Changes and historical context are temporarily unavailable.",
  );
  await expect(page.locator("#changesToggle")).toBeHidden();
  await expect(page.locator("#fleetSummaryBanner")).toBeVisible();
  await page.unroute("**/data/royal-navy/publication-changes.json");

  await page.route("**/data/royal-navy/vessels.json", (route) =>
    route.fulfill({ json: { metadata: fleet.metadata, vessels: [] } }),
  );
  await page.reload();
  await expect(page.locator("#loadingState")).toBeHidden();
  await expect(page.locator("#loadError")).toBeVisible();
  await expect(page.locator("#loadErrorMessage")).toContainText("no vessel records");
});

test("desktop, iPad portrait, iPad landscape and mobile use intentional map-first layouts", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900, sheet: false },
    { width: 820, height: 1180, sheet: true },
    { width: 1180, height: 820, sheet: false },
    { width: 390, height: 844, sheet: true },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?view=2");
    await expect(page.locator("#mapTitle")).toHaveText("British Armed Forces Tracker");
    const mapBox = await page.locator("#fleetMap").boundingBox();
    expect(mapBox.height).toBeGreaterThan(viewport.height * 0.7);

    await page.locator("#searchInput").fill("HMS Duncan");
    await page.locator('#vesselList button[data-vessel-id="hms-duncan"]').click();
    await expect.poll(async () => {
      const box = await page.locator("#detailDrawer").boundingBox();
      return Math.abs(box.y + box.height - viewport.height);
    }).toBeLessThan(3);
    const detailBox = await page.locator("#detailDrawer").boundingBox();
    if (viewport.sheet) {
      expect(detailBox.width).toBeGreaterThan(viewport.width * 0.9);
      expect(detailBox.y).toBeGreaterThan(viewport.height * 0.2);
    } else {
      expect(detailBox.width).toBeLessThan(viewport.width * 0.5);
    }
    await expect(page.locator('#detailPrimaryMeta [data-term="home-port"]')).toBeVisible();
  }
});

test("coarse-pointer iPad layouts replace the asset surface with selected details", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4176",
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const touchPage = await context.newPage();
  for (const viewport of [
    { width: 820, height: 1180, screenshot: "ipad-portrait.png", bottomSheet: true },
    { width: 1180, height: 820, screenshot: "ipad-landscape.png", bottomSheet: false },
  ]) {
    await touchPage.setViewportSize(viewport);
    await touchPage.goto("/");
    await expect.poll(() =>
      touchPage.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    await touchPage.locator("#searchInput").fill("HMS Duncan");
    await expect(touchPage.locator("#fleetDrawer")).toBeVisible();
    await touchPage.locator('#vesselList button[data-vessel-id="hms-duncan"]').click();
    await expect(touchPage.locator("#detailDrawer")).toBeVisible();
    await expect(touchPage.locator("#fleetDrawer")).toBeHidden();
    await expect(touchPage.locator('#detailPrimaryMeta [data-term="home-port"]')).toBeVisible();
    const detailBox = await touchPage.locator("#detailDrawer").boundingBox();
    if (viewport.bottomSheet) {
      await expect(touchPage.locator("#surfaceBackdrop")).toBeHidden();
      expect(detailBox.width).toBeGreaterThan(viewport.width * 0.9);
      expect(Math.abs(detailBox.y + detailBox.height - viewport.height)).toBeLessThan(3);
    } else {
      await expect(touchPage.locator("#surfaceBackdrop")).toBeHidden();
      expect(detailBox.width).toBeLessThan(viewport.width * 0.5);
      expect(detailBox.x).toBeGreaterThan(viewport.width * 0.5);
    }
    if (process.env.UPDATE_UX_SCREENSHOTS === "1") {
      await touchPage.screenshot({
        path: `docs/ux/issue-85/after/${viewport.screenshot}`,
      });
    }
  }
  await context.close();
});

test("map tile failure preserves the searchable textual experience", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.reload();
  await expect(page.locator("#mapNotice")).toBeVisible();
  await page.locator("#searchInput").fill("HMS Duncan");
  await expect(page.locator('#vesselList button[data-vessel-id="hms-duncan"]')).toBeVisible();
});

test("dataset-level staleness is explicit without inventing asset freshness", async ({ page }) => {
  const staleFleet = {
    ...fleet,
    metadata: {
      ...fleet.metadata,
      asOfDate: "2026-08-01",
      releaseRevision: 1,
      releasedAt: "2026-08-01T08:00:00Z",
    },
  };
  await page.route("**/data/royal-navy/vessels.json", (route) =>
    route.fulfill({ json: staleFleet }),
  );
  await page.reload();
  await expect(page.locator("#publicationFreshness")).toHaveAttribute("data-state", "stale");
  await expect(page.locator("#dataHealthNotice")).toContainText(
    "The public dataset is older than 14 days and may be stale.",
  );
  await expect(page.locator("#dataHealthNotice")).toContainText(
    "This does not imply an asset-level update or live position.",
  );
});

async function openAssets(page) {
  if (await page.locator("#fleetDrawer").isHidden()) {
    await page.locator("#fleetToggle").click();
  }
  await expect(page.locator("#fleetDrawer")).toBeVisible();
}

function classButtonSelector(vesselClass) {
  return `#classRibbon button[data-vessel-class=${JSON.stringify(vesselClass)}]`;
}
