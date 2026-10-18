import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { fileURLToPath } from "node:url";

// Library build for @gad-lang/git-vuetify. Vue, Vuetify, dockview, the
// CodeMirror packages and gad's CodeMirror plugin are externalized (peer and
// runtime deps of the host app), so the bundle ships only this package's code.
const external = ["vue", /^vuetify/, /^dockview/, /^@codemirror\//, /^@lezer\//, "@gad-lang/codemirror-gad"];

export default defineConfig({
  plugins: [vue(), vueJsx()],
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "git-vuetify.js",
    },
    rollupOptions: { external },
  },
});
