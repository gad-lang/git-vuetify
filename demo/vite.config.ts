import { defineConfig, searchForWorkspaceRoot } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

// Demo of @gad-lang/git-vuetify: the package from its source (beside the
// demo), gad's CodeMirror plugin from its source when inside the gad-lang/gad
// monorepo (else from npm). /api goes to the example backend
// (`bun run server -- --root <repo>`, port 8787; GIT_API to change it).
const alias: Record<string, string> = {
  "@gad-lang/git-vuetify": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
};
const cm = fileURLToPath(new URL("../../plugins/js/codemirror-gad/src/index.ts", import.meta.url));
if (existsSync(cm)) alias["@gad-lang/codemirror-gad"] = cm;

// the icons' fonts: where the package manager put @mdi/font (a store out of
// the workspace, with bun's isolated installs) — served too
const mdiFont = dirname(realpathSync(createRequire(import.meta.url).resolve("@mdi/font/package.json")));

export default defineConfig({
  plugins: [vue(), vueJsx()],
  resolve: {
    alias,
    dedupe: ["vue", "vuetify", "dockview-vue", "dockview-core", "@codemirror/state", "@codemirror/view", "@codemirror/language", "@lezer/common", "@lezer/highlight", "@lezer/lr"],
  },
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), mdiFont] },
    proxy: { "/api": process.env.GIT_API || "http://127.0.0.1:8787" },
  },
});
