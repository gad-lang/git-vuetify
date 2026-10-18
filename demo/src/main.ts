import { createApp } from "vue";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { aliases, mdi } from "vuetify/iconsets/mdi";
import App from "./App";

import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import "dockview-core/dist/styles/dockview.css";

const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;

createApp(App)
  .use(createVuetify({ components, directives, icons: { defaultSet: "mdi", aliases, sets: { mdi } }, theme: { defaultTheme: prefersDark ? "dark" : "light" } }))
  .mount("#app");
