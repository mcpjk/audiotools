import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const here = fileURLToPath(new URL(".", import.meta.url));

// Each tool is its own real HTML entry point — no client-side router, so direct
// links, bookmarks and refreshes work with zero server rewrite rules.
// To add a tool: add one line here, one entry HTML, one mount script, one card
// on index.html. See README.md.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(here, "index.html"),
        horn: resolve(here, "horn-calculator.html"),
        flh: resolve(here, "annular-flh.html"),
        directivity: resolve(here, "directivity-match.html"),
        aperture: resolve(here, "aperture-wavefield.html"),
        multicell: resolve(here, "multicell-horn.html"),
      },
    },
  },
});
