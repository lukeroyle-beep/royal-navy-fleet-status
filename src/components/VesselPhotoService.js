const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const EXCLUDED_TITLES = /\b(badge|crest|emblem|logo|pennant|ensign|coat of arms|ship's bell|plaque)\b/i;
const LOCAL_PHOTOS = new Set([
  "agamemnon.jpg", "ambush.jpg", "anson.jpg", "archer.jpg", "artful.jpg", "astute.jpg",
  "audacious.jpg", "bangor.jpg", "biter.jpg", "blazer.jpg", "brocklesby.jpg",
  "cardigan_bay.jpg", "cattistock.jpg", "charger.jpg", "chiddingfold.jpg", "cutlass.jpg",
  "dagger.jpg", "daring.jpg", "dasher.jpg", "dauntless.jpg", "defender.jpg", "diamond.jpg",
  "dragon.jpg", "duncan.jpg", "example.jpg", "exploit.jpg", "explorer.jpg", "express.jpg", "forth.jpg",
  "hurworth.jpg", "iron_duke.jpg", "kent.jpg", "ledbury.jpg", "magpie.jpg", "medway.jpg",
  "lyme_bay.jpg", "mersey.jpg", "middleton.jpg", "mounts_bay.jpg", "portland.jpg",
  "prince_of_wales.jpg", "protector.jpg", "proteus.jpg", "puncher.jpg",
  "pursuer.jpg", "queen_elizabeth.jpg", "raider.jpg", "ranger.jpg", "richmond.jpg",
  "scott.jpg", "severn.jpg", "smiter.jpg", "somerset.jpg", "spey.jpg", "st_albans.jpg",
  "stirling_castle.jpg", "sutherland.jpg", "tamar.jpg", "tideforce.jpg", "tiderace.jpg",
  "tidespring.jpg", "tidesurge.jpg", "tracker.jpg",
  "trent.jpg", "trumpeter.jpg", "tyne.jpg", "vanguard.jpg", "vengeance.jpg",
  "victorious.jpg", "victory.jpg", "vigilant.jpg",
]);

const LOCAL_PHOTO_CREDITS = new Map([
  ["agamemnon.jpg", commonsCredit("HMS_Agamennon_formal_naming_cerimony.jpg")],
  ["ambush.jpg", commonsCredit("HMS_Ambush_long.jpg")],
  [
    "artful.jpg",
    {
      pageUrl: "https://www.gov.uk/government/news/new-navigation-radar-system-for-royal-navy",
      creditLabel: "Photograph: Ministry of Defence",
    },
  ],
  ["astute.jpg", commonsCredit("HMS_Astute_Arrives_at_Faslane_for_the_First_Time_MOD_45150830.jpg")],
  [
    "audacious.jpg",
    {
      pageUrl: "https://www.royalnavy.mod.uk/news/2020/april/07/200407-hms-audacious-back-in-faslane",
      creditLabel: "Photograph: Royal Navy",
    },
  ],
  ["daring.jpg", commonsCredit("Royal_Navy_Type_45_Destroyer_HMS_Daring_MOD_45153705.jpg")],
  ["duncan.jpg", commonsCredit("HMS_Duncan_-_1.jpg")],
  ["example.jpg", commonsCredit("HMS_Example_(P165)_Helsinki.JPG")],
  ["exploit.jpg", commonsCredit("HMS_Exploit_-_Penarth_Marina_-_geograph.org.uk_-_1723352.jpg")],
  ["express.jpg", commonsCredit("HMS_Express-2.jpg")],
  ["kent.jpg", commonsCredit("HMS_Kent_carries_out_manoeuvres_off_the_coast_of_Djibouti._MOD_45158509.jpg")],
  ["ledbury.jpg", commonsCredit("HMS_Ledbury_depolyed_on_Op_KIPION_MOD_45167292.jpg")],
  ["lyme_bay.jpg", commonsCredit("UK_task_group_links_up_with_Italian_carrier_in_last_act_of_autumn_deployment_MOD_45167525.jpg")],
  ["mounts_bay.jpg", commonsCredit("Mounts_Bay_(L3008).jpg")],
  ["portland.jpg", commonsCredit("HMS_Portland_Sails_Near_Huge_Glacier_in_South_Georgia_MOD_45151714.jpg")],
  ["protector.jpg", commonsCredit("Royal_Navy_Antarctic_Patrol_Ship_HMS_Protector_MOD_45153156.jpg")],
  ["proteus.jpg", commonsCredit("RFA_Proteus_in_Cammell_Laird.webp")],
  ["pursuer.jpg", commonsCredit("HMS_Pursuer.jpg")],
  ["st_albans.jpg", commonsCredit("PHOTEXOF_HMS_ST_ALBANS_MOD_45161945.jpg")],
  ["sutherland.jpg", commonsCredit("HMS_Sutherland_(F81)_MoD.jpg")],
  ["tideforce.jpg", commonsCredit("RFA_Tideforce_(A139)_1.jpg")],
  ["tidespring.jpg", commonsCredit("RFA_Tidespring.jpg")],
  ["tidesurge.jpg", commonsCredit("RFA_Tidesurge_MOD_45163850.jpg")],
  ["trumpeter.jpg", commonsCredit("Britisches_Motorboot_(7392690658).jpg")],
  ["vengeance.jpg", commonsCredit("Image_of_HMS_Vengeance_returning_to_HMNB_Clyde,_after_completing_Operational_Sea_Training_MOD_45159434.jpg")],
  ["victorious.jpg", commonsCredit("Trident_Nuclear_Submarine_HMS_Victorious.jpg")],
  ["vigilant.jpg", commonsCredit("HMS_Vigilant_MOD_45157568.jpg")],
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
    const credit = LOCAL_PHOTO_CREDITS.get(filename);

    return {
      imageUrl: `./photos/${filename}`,
      pageUrl: credit?.pageUrl || null,
      creditLabel: credit?.creditLabel || null,
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

function commonsCredit(filename) {
  return {
    pageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
    creditLabel: "Photograph: Wikimedia Commons",
  };
}
