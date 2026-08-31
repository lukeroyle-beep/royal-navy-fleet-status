export const EXACT_BERTH_DISCLOSURE_PATTERN =
  /\b(?:berth|jetty)\b|alongside\s+(?:HMS|RFA)\b/i;

export function hasExactBerthDisclosure(value) {
  return EXACT_BERTH_DISCLOSURE_PATTERN.test(String(value || ""));
}

export function sanitisePublicLocationDescription(value, fallbackLabel = "") {
  const original = String(value || "").trim();
  if (!hasExactBerthDisclosure(original)) return original;

  const [reportedPlace, ...detailParts] = original.split(";");
  const safePlace = generalisePlace(fallbackLabel) || generalisePlace(reportedPlace);
  const detail = detailParts
    .join(";")
    .trim()
    .replace(
      /^alongside(?:\s+(?:HMS|RFA)\s+.+?)?\s+reported\b/i,
      "presence reported",
    );

  return [safePlace, detail].filter(Boolean).join("; ");
}

function generalisePlace(value) {
  let label = String(value || "")
    .replace(/\s*\/\s*(?:HMS|RFA)\b.*$/i, "")
    .trim();
  if (!/\b(?:berth|jetty)\b/i.test(label)) return label;

  const commaParts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length > 1) return commaParts.at(-1);

  label = label
    .replace(/\b(?:town\s+)?(?:ammunition\s+)?(?:berth|jetty)(?:\s+area)?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return label;
}
