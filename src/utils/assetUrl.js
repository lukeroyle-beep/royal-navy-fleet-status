export function publicAssetUrl(relativePath, baseUrl = import.meta.env?.BASE_URL || "/") {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${String(relativePath).replace(/^\/+/, "")}`;
}
