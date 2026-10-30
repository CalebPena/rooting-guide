import { fileURLToPath } from "node:url";
import sharp from "sharp";

const teams = process.argv.slice(2);
const directories = teams.length ? teams : ["red_sox", "patriots"];
const icons = [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
];

await Promise.all(directories.flatMap((team) => {
  const directory = new URL(`../${team}/public/`, import.meta.url);
  const source = fileURLToPath(new URL("favicon.svg", directory));
  return icons.map(([name, size]) => sharp(source).resize(size, size).png().toFile(fileURLToPath(new URL(name, directory))));
}));
