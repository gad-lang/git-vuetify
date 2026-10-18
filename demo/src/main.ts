import { createApp } from "vue";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { aliases, mdi } from "vuetify/iconsets/mdi";
import { createI18n } from "vue-i18n";
import App from "./App";

import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import "dockview-core/dist/styles/dockview.css";

const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;

// the app's vue-i18n: the panels read their words from it (gadGit), their
// defaults merged under what it has — a translation of the app's would win
const i18n = createI18n({ legacy: false, locale: navigator.language.startsWith("pt") ? "pt" : "en", fallbackLocale: "en" });

createApp(App)
  .use(i18n)
  .use(createVuetify({ components, directives, icons: { defaultSet: "mdi", aliases, sets: { mdi } }, theme: { defaultTheme: prefersDark ? "dark" : "light" } }))
  .mount("#app");
