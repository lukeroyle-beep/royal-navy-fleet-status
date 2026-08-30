import { expect, test } from "@playwright/test";
import fs from "node:fs";

const fleet = JSON.parse(
  fs.readFileSync(new URL("../../data/royal-navy/vessels.json", import.meta.url), "utf8"),
);
const historicalSnapshotDate = "2026-08-12";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#asOfDate")).not.toHaveText("Loading");
  await expect(page.locator("#loadError")).toBeHidden();
});

test("every current class keeps its list and point-marker counts aligned", async ({ page }) => {
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

test("historical status snapshots explicitly show why markers are absent", async ({ page }) => {
  await page.locator("#snapshotSelect").selectOption(historicalSnapshotDate);
  await expect(page.locator("#publicationFreshness")).toHaveText("Historical status only");
  await expect(page.locator("#plotResultStatus")).toContainText("0 point-mapped");
  await expect(page.locator("#mapFilterNotice")).toHaveText(
    "Location details are not published for this historical snapshot, so no vessel markers are shown.",
  );
  await expect(page.locator(".fleet-marker")).toHaveCount(0);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("snapshot"))
    .toBe(historicalSnapshotDate);
  await page.reload();
  await expect(page.locator("#snapshotSelect")).toHaveValue(historicalSnapshotDate);
  await expect(page.locator("#mapFilterNotice")).toBeVisible();
});

test("desktop right-side panels are exclusive and list selections explain map display", async ({ page }) => {
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
  await expect(page.locator("#detailPrimaryMeta")).toContainText("Map display");
  await expect(page.locator("#detailPrimaryMeta")).toContainText(
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
  const classVesselButton = page.locator("#classAvailabilityVessels button").first();
  await classVesselButton.click();
  await expect(page.locator("#detailDrawer")).toBeVisible();
  await expect(page.locator("#filterPanel")).toBeHidden();
  await page.locator('[data-close-surface="detail"]').click();
  await expect(page.locator("#filterPanel")).toBeVisible();
  await expect(classVesselButton).toBeFocused();
});

function classButtonSelector(vesselClass) {
  return `#classRibbon button[data-vessel-class=${JSON.stringify(vesselClass)}]`;
}
