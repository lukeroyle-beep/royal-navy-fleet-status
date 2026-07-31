import assert from "node:assert/strict";
import fs from "node:fs";

const photoDirectory = new URL("../public/photos/", import.meta.url);
const photoService = fs.readFileSync(new URL("../src/components/VesselPhotoService.js", import.meta.url), "utf8");
const detailPanel = fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const filenames = fs.readdirSync(photoDirectory).filter((filename) => /\.(?:jpe?g|png)$/i.test(filename));

assert.equal(filenames.length, 71, "Every fleet record must have one curated local photograph.");
assert.doesNotMatch(photoService, /Photograph supplied locally/);
assert.ok(!filenames.includes("duncan.png"), "The historical HMS Duncan image must not be shipped.");
assert.ok(!filenames.includes("vigilant.png"), "The corrupt HMS Vigilant image must not be shipped.");
assert.doesNotMatch(html, /figcaption|detailPhotoCredit|dataDisclaimer/);
assert.doesNotMatch(detailPanel, /photoCredit|photoCaption/);
assert.match(photoService, /HMS_Astute_Arrives_at_Faslane_for_the_First_Time/);

for (const filename of filenames) {
  const bytes = fs.readFileSync(new URL(filename, photoDirectory));
  assert.ok(bytes.length > 10_000, `${filename} is unexpectedly small or empty.`);

  if (/\.jpe?g$/i.test(filename)) {
    assert.equal(bytes[0], 0xff, `${filename} is not a valid JPEG.`);
    assert.equal(bytes[1], 0xd8, `${filename} is not a valid JPEG.`);
    assert.equal(bytes.at(-2), 0xff, `${filename} has a truncated JPEG data stream.`);
    assert.equal(bytes.at(-1), 0xd9, `${filename} has a truncated JPEG data stream.`);
  } else {
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${filename} is not a valid PNG.`,
    );
    assert.equal(bytes.subarray(-8, -4).toString("ascii"), "IEND", `${filename} has a truncated PNG data stream.`);
  }
}

console.log(`Fleet photo tests passed for ${filenames.length} local images.`);
