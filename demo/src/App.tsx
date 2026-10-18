// The demo: the Git and Changes panels of a repository — the example
// backend's (/api/, ../server) —, side by side or one at a time, in English
// or Brazilian Portuguese, light or dark.
import { computed, defineComponent, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useTheme } from "vuetify";
import { VApp, VAppBar, VAppBarTitle, VBtn, VBtnToggle, VMain, VSpacer, VTextField } from "vuetify/components";
import { ChangesPanel, createHttpGitApi, GitPanel } from "@gad-lang/git-vuetify";

const api = createHttpGitApi("/api/");

export default defineComponent({
  name: "App",
  setup() {
    const theme = useTheme();
    const dark = computed(() => theme.global.current.value.dark);
    const view = ref<"git" | "changes" | "both">("git");
    // the language: the app's vue-i18n's locale — the panels follow it
    const { locale } = useI18n({ useScope: "global" });
    const lang = computed({ get: () => (String(locale.value).startsWith("pt") ? "pt" : "en"), set: (v) => (locale.value = v) });
    // the file "open": the Git panel's file history follows it
    const openPath = ref("");
    const writes = ref(0);

    // the VBtnToggle's model (a TSX prop pair)
    const model = <T,>(r: { value: T }) => ({ modelValue: r.value, "onUpdate:modelValue": (v: T) => v && (r.value = v) });

    return () => (
      <VApp>
        <VAppBar density="compact" flat border>
          <VAppBarTitle class="text-subtitle-1">@gad-lang/git-vuetify</VAppBarTitle>
          <VTextField
            modelValue={openPath.value}
            {...{ "onUpdate:modelValue": (v: string) => (openPath.value = v ?? "") }}
            placeholder={lang.value === "pt" ? "Arquivo aberto (histórico)" : "File open (history)"}
            density="compact" variant="outlined" hideDetails clearable class="mx-4" style={{ maxWidth: "360px" }}
            prependInnerIcon="mdi-file-outline"
          />
          <VSpacer />
          <VBtnToggle {...model(view)} density="compact" variant="outlined" divided mandatory class="me-2">
            <VBtn value="git" size="small" prependIcon="mdi-source-branch">Git</VBtn>
            <VBtn value="changes" size="small" prependIcon="mdi-file-compare">{lang.value === "pt" ? "Alterações" : "Changes"}</VBtn>
            <VBtn value="both" size="small" icon="mdi-view-split-horizontal" />
          </VBtnToggle>
          <VBtnToggle {...model(lang)} density="compact" variant="outlined" divided mandatory class="me-2">
            <VBtn value="en" size="small">EN</VBtn>
            <VBtn value="pt" size="small">PT</VBtn>
          </VBtnToggle>
          <VBtn icon={dark.value ? "mdi-weather-sunny" : "mdi-weather-night"} size="small" variant="text"
            {...{ onClick: () => (theme.global.name.value = dark.value ? "light" : "dark") }} />
        </VAppBar>
        <VMain>
          <div class="demo-panels" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 49px)" }}>
            {view.value !== "changes" && (
              <div style={{ flex: "1 1 0", minHeight: 0 }}>
                <GitPanel api={api} dark={dark.value} openPath={openPath.value} />
              </div>
            )}
            {view.value !== "git" && (
              <div style={{ flex: "1 1 0", minHeight: 0, borderTop: "1px solid rgba(var(--v-border-color), var(--v-border-opacity))" }}>
                <ChangesPanel api={api} dark={dark.value} writes={writes.value} />
              </div>
            )}
          </div>
        </VMain>
      </VApp>
    );
  },
});
