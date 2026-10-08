import { writeFile } from "node:fs/promises";
import { titles } from "../js/data/titles.js";
const id = "spiderman-brand-new-day";
const source = "https://www.sonypictures.com/movies/spidermanbrandnewday";
const film = {
  id,
  name: "Spider-Man: Brand New Day",
  year: 2026,
  type: "movies",
  duration: 8678.016,
  poster: "assets/posters/spiderman-brand-new-day.jpg",
  source,
  watchSource: source,
  imageSource:
    "https://www.sonypictures.com/sites/default/files/styles/max_860x460/public/title-key-art/spidermanbrandnewday_onesheet_1400x2100_1.jpg?itok=hXKCyx3k",
  qualities: [
    {
      quality: "1080p",
      bytes: 3754810041,
      url: "videos/spider-man-brand-new-day.mp4",
    },
  ],
  localAsset: "videos/spider-man-brand-new-day.mp4",
  descriptionKey: "film.spiderman-brand-new-day",
  isNew: true,
  isTrending: true,
  creator: "Columbia Pictures · Marvel Studios · Pascal Pictures",
  licenseSource: source,
  provenance: {
    type: "USER_LOCAL_FILE",
    originalName: "SPIDERMAN BRAND NEW DAY.mp4",
    sha256: "36919DFFCAF8276BC8387FECD608B4F5593A2A0A9E1AE92AE91EE283756B158E",
    bytes: 3754810041,
    width: 1920,
    height: 800,
    unchanged: true,
  },
};
const catalog = [...titles.filter((title) => title.id !== id), film];
await writeFile(
  "js/data/titles.js",
  `export const titles = Object.freeze(${JSON.stringify(catalog, null, 2)}.map(Object.freeze));\n`,
);
await writeFile(
  "assets/catalog-sources.json",
  `${JSON.stringify(catalog, null, 2)}\n`,
);
const translations = {
  es: [
    "Tendencias",
    "Peter Parker vuelve a enfrentar nuevas amenazas mientras intenta encontrar su lugar en un mundo que ha olvidado quién es.",
  ],
  en: [
    "Trending",
    "Peter Parker faces new threats while searching for his place in a world that has forgotten who he is.",
  ],
  it: [
    "Di tendenza",
    "Peter Parker affronta nuove minacce mentre cerca il proprio posto in un mondo che ha dimenticato chi è.",
  ],
  ar: [
    "الرائج",
    "يواجه بيتر باركر تهديدات جديدة بينما يبحث عن مكانه في عالم نسي هويته.",
  ],
};
for (const [code, [heading, description]] of Object.entries(translations)) {
  const dictionary = (await import(`../locales/${code}.js`)).default;
  dictionary["home.trending"] = heading;
  dictionary["film.spiderman-brand-new-day"] = description;
  await writeFile(
    `locales/${code}.js`,
    `export default ${JSON.stringify(dictionary, null, 2)};\n`,
  );
}
