// ChangesPanel: the files changed and not committed (api.changes), in the
// diff browser — each compared with HEAD's, the current side edited (a
// change taken back, undone, redone, saved) unless readonly. Looked at again
// when `writes` changes (a file written beside), and on its button.
//
// canCommit (and api.commitNew): commits, as an IDE does — each file of the
// tree with its check (all chosen at first; a new file changed too), the box
// of all of them, the message and the button (Ctrl+Enter): the files chosen
// committed, a renamed one with where it was.
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import { VBtn, VProgressCircular, VTextarea } from "./vuetify";
import HelpButton from "./HelpButton";
import { diffLabels, useGitMessages, type GitMessages } from "./messages";
import DiffBrowser from "./diff/DiffBrowser.vue";
import type { Content, DiffFile, SaveState } from "./diff/diffBrowserContext";
import type { GitApi } from "./api";
import { useGitRoot } from "./root";

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
    /** commits from here: the files chosen, a message */
    canCommit: { type: Boolean, default: false },
    /** a counter of the files written beside: its change looks again */
    writes: { type: Number, default: 0 },
    /** the texts, over the app's vue-i18n's (gadGit) and the defaults */
    messages: { type: Object as PropType<Partial<GitMessages>>, default: undefined },
  },
  emits: {
    /** a file saved from the compare (path) */
    saved: (_path: string) => true,
    /** a commit made (its short hash) */
    committed: (_hash: string) => true,
  },
  // slots: actions — at the end of the bar (an expand button)
  setup(props, { emit, slots }) {
    const git = props.api;
    // the folders of the list from the repository's root
    const root = useGitRoot(git);
    const m = useGitMessages(() => props.messages);
    const files = ref<DiffFile[]>([]);
    const error = ref("");
    const loading = ref(false);
    const browser = ref<{ reload(): void }>();

    // the commit: the files left out (by path; the others chosen), the message
    const left = ref(new Set<string>());
    const msg = ref("");
    const committing = ref(false);
    const done = ref("");
    const commitOn = computed(() => props.canCommit && !!git.commitNew);
    const chosen = computed(() => files.value.filter((f) => !left.value.has(f.path)));
    const check = (path: string, on: boolean) => {
      const s = new Set(left.value);
      if (on) s.delete(path);
      else s.add(path);
      left.value = s;
    };
    const checkAll = (on: boolean) => (left.value = on ? new Set() : new Set(files.value.map((f) => f.path)));
    async function commit() {
      if (!git.commitNew || committing.value || !msg.value.trim() || !chosen.value.length) return;
      committing.value = true;
      error.value = done.value = "";
      try {
        const paths = chosen.value.flatMap((f) => (f.from ? [f.path, f.from] : [f.path]));
        const c = await git.commitNew(msg.value, paths);
        done.value = m.value.committed + " " + c.hash;
        msg.value = "";
        emit("committed", c.hash);
        await refresh();
      } catch (e) {
        error.value = message(e);
      } finally {
        committing.value = false;
      }
    }

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
        // the left out that are gone: forgotten (changed again, chosen)
        const paths = new Set(f.map((x) => x.path));
        left.value = new Set([...left.value].filter((p) => paths.has(p)));
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
            root: root.value,
          }, commitOn.value ? {
            lead: ({ file }: { file: DiffFile }) => (
              <input
                type="checkbox"
                class="gad-git__commit-check"
                checked={!left.value.has(file.path)}
                title={m.value.commit}
                data-commit-check={file.path}
                onChange={(e: Event) => check(file.path, (e.target as HTMLInputElement).checked)}
              />
            ),
          } : undefined)}
        </div>
        {commitOn.value && files.value.length > 0 && (
          <div class="gad-git__commit" data-git-commit>
            <label class="gad-git__commit-all">
              <input
                type="checkbox"
                class="gad-git__commit-check"
                checked={chosen.value.length === files.value.length}
                indeterminate={chosen.value.length > 0 && chosen.value.length < files.value.length}
                data-commit-all
                onChange={(e: Event) => checkAll((e.target as HTMLInputElement).checked)}
              />
              <span>{m.value.commitAll}</span>
              <span class="gad-git__git-count">{chosen.value.length}/{files.value.length}</span>
            </label>
            <VTextarea
              modelValue={msg.value}
              {...{ "onUpdate:modelValue": (v: string) => (msg.value = v) }}
              placeholder={m.value.commitMessage}
              rows={2}
              autoGrow
              maxRows={8}
              density="compact"
              variant="outlined"
              hideDetails
              data-commit-message
              onKeydown={(e: KeyboardEvent) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void commit();
                }
              }}
            />
            <div class="gad-git__commit-bar">
              <VBtn
                size="small"
                color="primary"
                prependIcon="mdi-source-commit"
                loading={committing.value}
                disabled={!msg.value.trim() || !chosen.value.length}
                title={chosen.value.length ? m.value.commit + " (Ctrl+Enter)" : m.value.commitNone}
                data-commit
                onClick={commit}
              >
                {m.value.commit}
              </VBtn>
              {!chosen.value.length && <span class="text-medium-emphasis text-body-2">{m.value.commitNone}</span>}
              {done.value && <span class="text-success text-body-2" data-committed>{done.value}</span>}
            </div>
          </div>
        )}
      </div>
    );
  },
});
