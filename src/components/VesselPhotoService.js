const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const EXCLUDED_TITLES = /\b(badge|crest|emblem|logo|pennant|ensign|coat of arms|ship's bell|plaque)\b/i;
const LOCAL_PHOTOS = new Set([
  "agamemnon.jpg", "ambush.jpg", "anson.jpg", "archer.jpg", "artful.jpg", "astute.jpg",
  "audacious.jpg", "bangor.jpg", "biter.jpg", "blazer.jpg", "brocklesby.jpg",
  "cardigan_bay.jpg", "cattistock.jpg", "charger.jpg", "chiddingfold.jpg", "cutlass.jpg",
  "dagger.jpg", "daring.jpg", "dasher.jpg", "dauntless.jpg", "defender.jpg", "diamond.jpg",
  "dragon.jpg", "duncan.png", "explorer.jpg", "express.jpg", "forth.jpg",
  "hurworth.jpg", "iron_duke.jpg", "kent.jpg", "ledbury.jpg", "magpie.jpg", "medway.jpg",
  "mersey.jpg", "middleton.jpg", "portland.jpg", "prince_of_wales.jpg", "puncher.jpg",
  "pursuer.jpg", "queen_elizabeth.jpg", "raider.jpg", "ranger.jpg", "richmond.jpg",
  "scott.jpg", "severn.jpg", "smiter.jpg", "somerset.jpg", "spey.jpg", "st_albans.jpg",
  "stirling_castle.jpg", "sutherland.jpg", "tamar.jpg", "tiderace.jpg", "tracker.jpg",
  "trent.jpg", "trumpeter.jpg", "tyne.jpg", "vanguard.jpg", "vengeance.jpg",
  "victorious.jpg", "victory.jpg", "vigilant.png",
]);

export class VesselPhotoService {
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
    this.cache = new Map();
  }

  async find(vessel) {
    const localPhoto = this.#findLocal(vessel);
    if (localPhoto) return localPhoto;

    if (!this.cache.has(vessel.id)) {
      this.cache.set(vessel.id, this.#search(vessel));
    }
    return this.cache.get(vessel.id);
  }

  #findLocal(vessel) {
    const stem = vessel.name
      .replace(/^(HMS|RFA)\s+/i, "")
      .toLocaleLowerCase("en-GB")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const filename = [`${stem}.jpg`, `${stem}.png`].find((candidate) => LOCAL_PHOTOS.has(candidate));
    if (!filename) return null;

    return {
      imageUrl: `./photos/${filename}`,
      pageUrl: null,
      creditLabel: "Photograph supplied locally",
    };
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
    if (!page) return this.#findWikipediaImage(vessel);

    const info = page.imageinfo[0];
    return {
      imageUrl: info.thumburl,
      pageUrl: info.descriptionurl,
      creditLabel: "Photograph: Wikimedia Commons",
    };
  }

  async #findWikipediaImage(vessel) {
    const response = await this.fetcher(`${WIKIPEDIA_SUMMARY}${encodeURIComponent(vessel.name)}`);
    if (!response.ok) return null;
    const page = await response.json();
    if (!page.thumbnail?.source || !page.content_urls?.desktop?.page) return null;
    return {
      imageUrl: page.thumbnail.source.replace(/\/\d+px-/, "/900px-"),
      pageUrl: page.content_urls.desktop.page,
      creditLabel: "Photograph: Wikipedia",
    };
  }
}
