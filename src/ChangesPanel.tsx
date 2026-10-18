// ChangesPanel: the files changed and not committed (api.changes), in the
// diff browser — each compared with HEAD's, the current side edited (a
// change taken back, undone, redone, saved) unless readonly. Looked at again
// when `writes` changes (a file written beside), and on its button.
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import { VBtn, VProgressCircular } from "./vuetify";
import HelpButton from "./HelpButton";
import { diffLabels, gitMessagesOf, type GitMessages } from "./messages";
import DiffBrowser from "./diff/DiffBrowser.vue";
import type { Content, DiffFile, SaveState } from "./diff/diffBrowserContext";
import type { GitApi } from "./api";

const message = (e: unknown) => String((e as { message?: string })?.message || e);

export default defineComponent({
  name: "ChangesPanel",
  props: {
    /** the repository's API */
    api: { type: Object as PropType<GitApi>, required: true },
    /** the diff editors' theme */
    dark: { type: Boolean, default: false },
    /** no file is saved (the current sides not edited) */
    readonly: { type: Boolean, default: false },
    /** a counter of the files written beside: its change looks again */
    writes: { type: Number, default: 0 },
    /** the texts, over DEFAULT_GIT_MESSAGES (English) */
    messages: { type: Object as PropType<Partial<GitMessages>>, default: undefined },
  },
  emits: {
    /** a file saved from the compare (path) */
    saved: (_path: string) => true,
  },
  // slots: actions — at the end of the bar (an expand button)
  setup(props, { emit, slots }) {
    const git = props.api;
    const m = gitMessagesOf(() => props.messages);
    const files = ref<DiffFile[]>([]);
    const error = ref("");
    const loading = ref(false);
    const browser = ref<{ reload(): void }>();

    // refresh asks for the changes again, and for the diffs open: the last
    // asked is the one shown
    let seq = 0;
    async function refresh() {
      const n = ++seq;
      loading.value = true;
      try {
        const f = await git.changes();
        if (n !== seq) return;
        files.value = f;
        error.value = "";
        browser.value?.reload();
      } catch (e) {
        if (n === seq) error.value = message(e);
      } finally {
        if (n === seq) loading.value = false;
      }
    }
    onMounted(refresh);

    // a file written by the IDE: looked at again, once the writes stop
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(() => props.writes, () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    });
    onBeforeUnmount(() => clearTimeout(timer));

    const load = (c: Content) =>
      git.diff(c.file.path, c.file.from).then(
        (v) => {
          c.value = v;
          c.error = undefined;
        },
        (e) => (c.error = message(e)),
      );
    const save = (path: string, state: SaveState) =>
      git.save(path, state.value).then(
        () => {
          state.saved = true;
          emit("saved", path);
          void refresh();
        },
        (e) => (state.error = message(e)),
      );

    return () => (
      <div class="gad-git__changes" data-git-changes>
        <div class="gad-git__git-bar">
          <span class="gad-git__git-title">{m.value.changes}</span>
          <span class="gad-git__git-count">{files.value.length}</span>
          <VBtn size="x-small" variant="text" icon="mdi-refresh" title={m.value.refresh} data-changes-refresh onClick={refresh} />
          {loading.value && <VProgressCircular indeterminate size={14} width={2} color="primary" />}
          {error.value && <span class="text-error text-body-2 ms-2">{error.value}</span>}
          <span class="gad-git__git-spacer" />
          <HelpButton id="changes" title={m.value.changes} text={m.value.helpChanges} />
          {slots.actions?.()}
        </div>
        <div class="gad-git__git-fill">
          {h(DiffBrowser, {
            ...diffLabels(m.value),
            ref: browser,
            files: files.value,
            load,
            save: props.readonly ? undefined : save,
            dark: props.dark,
            height: "100%",
          })}
        </div>
      </div>
    );
  },
});
