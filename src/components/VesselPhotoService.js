const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const EXCLUDED_TITLES = /\b(badge|crest|emblem|logo|pennant|ensign|coat of arms|ship's bell|plaque)\b/i;

export class VesselPhotoService {
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
    this.cache = new Map();
  }

  async find(vessel) {
    if (!this.cache.has(vessel.id)) {
      this.cache.set(vessel.id, this.#search(vessel));
    }
    return this.cache.get(vessel.id);
  }

  async #search(vessel) {
    const query = [vessel.name, vessel.pennantNumber].filter(Boolean).join(" ");
    const url = new URL(COMMONS_API);
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrnamespace: "6",
      gsrlimit: "10",
      gsrsearch: `${query} filetype:bitmap`,
      prop: "imageinfo",
      iiprop: "url|mime",
      iiurlwidth: "900",
    });

    const response = await this.fetcher(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const pages = Object.values(payload.query?.pages || {});
    const page = pages.find((candidate) => {
      const info = candidate.imageinfo?.[0];
      return info?.thumburl && info.mime?.startsWith("image/") && !EXCLUDED_TITLES.test(candidate.title);
    });
    if (!page) return null;

    const info = page.imageinfo[0];
    return {
      imageUrl: info.thumburl,
      pageUrl: info.descriptionurl,
    };
  }
}
