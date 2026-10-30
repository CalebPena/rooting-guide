import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));
const teams = [
  { path: "red-sox", directory: "red_sox" },
  { path: "patriots", directory: "patriots" },
];
const contentTypes = {
  svg: "image/svg+xml",
  png: "image/png",
  webmanifest: "application/manifest+json",
};

function teamAssets() {
  function assets() {
    return teams.flatMap((team) => {
      const directory = resolve(root, team.directory, "public");
      return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => ({
        name: `${team.path}/${entry.name}`,
        file: resolve(directory, entry.name),
      }));
    });
  }

  return {
    name: "team-assets",
    configureServer(server) {
      const files = new Map(assets().map((asset) => [`/${asset.name}`, asset]));
      server.middlewares.use((request, response, next) => {
        const asset = files.get(new URL(request.url, "http://localhost").pathname);
        if (!asset || !["GET", "HEAD"].includes(request.method)) return next();
        response.setHeader("Content-Type", contentTypes[asset.name.split(".").at(-1)] ?? "application/octet-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.end(request.method === "HEAD" ? undefined : readFileSync(asset.file));
      });
    },
    generateBundle() {
      for (const asset of assets()) {
        this.emitFile({ type: "asset", fileName: asset.name, source: readFileSync(asset.file) });
      }
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), teamAssets()],
  publicDir: "public",
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    rollupOptions: {
      input: {
        home: resolve(root, "index.html"),
        redSox: resolve(root, "red-sox/index.html"),
        patriots: resolve(root, "patriots/index.html"),
      },
    },
  },
});
