// StashView: the stashes of the repository (the Git panel's mode Stashes),
// managed as an IDE does: the list, the newest first — + stashes the changes
// of the workspace (a message, the untracked files too, the index kept), the
// bin drops them all —; a stash chosen shows its changes, file by file (its
// untracked files too), or, by "Compare with", it compared with the working
// files, a branch (its tip or a commit of its log) or another stash; it is
// put back (Unstash: applied or popped, the index reinstated, or as a new
// branch) or dropped. The list's width and the head's height are dragged by
// their edges (kept).
import { computed, defineComponent, h, onMounted, ref, watch, type PropType } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VCheckbox, VDialog, VSpacer, VTextField } from "./vuetify";
import { diffLabels, type GitMessages } from "./messages";
import DiffBrowser from "./diff/DiffBrowser.vue";
import type { Content, DiffFile } from "./diff/diffBrowserContext";
import type { GitApi, GitBranch, GitCommitDetail, GitStash } from "./api";
import HelpButton from "./HelpButton";
import RefPicker, { type PickedRef } from "./RefPicker";
import TipBtn from "./TipBtn";
import { ResizeHandle, useStoredSize } from "./resize";

const message = (e: unknown) => String((e as { message?: string })?.message || e);
const shortDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
};
const short = (ref: string) => (/^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 10) : ref);

interface View {
  key: string;
  files: DiffFile[];
  oldLabel: string;
  newLabel: string;
  title?: string;
  load: (c: Content) => Promise<void>;
}

export default defineComponent({
  name: "StashView",
  props: {
    api: { type: Object as PropType<GitApi>, required: true },
    messages: { type: Object as PropType<GitMessages>, required: true },
    dark: { type: Boolean, default: false },
    /** the workspace's folder in the repository (the files' lists) */
    root: { type: String, default: "" },
    /** the branches (the Git panel's) */
    branches: { type: Array as PropType<GitBranch[]>, default: () => [] },
  },
  emits: {
    /** the working files changed (a stash made, put back) */
    changed: () => true,
    /** busy: a request going (+1), done (-1); its error, "" none */
    busy: (_d: number) => true,
    error: (_e: string) => true,
  },
  setup(props, { emit, expose }) {
    const git = props.api;
    const m = computed(() => props.messages);
    const stashes = ref<GitStash[]>([]);
    const selected = ref("");
    const detail = ref<GitCommitDetail>();
    // what it is compared with (RefPicker): none, its own changes
    const picked = ref<PickedRef | null>(null);
    const view = ref<View>();

    const listW = useStoredSize("gad-ide.git.stashes", 300, 140, 900);
    const headH = useStoredSize("gad-ide.git.stash-head", 96, 40, 800);

    async function busy<T>(f: () => Promise<T>): Promise<T | undefined> {
      emit("busy", 1);
      try {
        const v = await f();
        emit("error", "");
        return v;
      } catch (e) {
        emit("error", message(e));
      } finally {
        emit("busy", -1);
      }
    }

    async function load() {
      const st = await busy(() => git.stashes!());
      if (!st) return;
      stashes.value = st;
      if (selected.value && !st.some((s) => s.hash === selected.value)) {
        selected.value = "";
        detail.value = undefined;
        view.value = undefined;
      }
    }
    onMounted(load);
    expose({ refresh: load });

    const current = computed(() => stashes.value.find((s) => s.hash === selected.value));
    const ro = (files: DiffFile[]) => files.map((f) => ({ ...f, readOnly: true }));
    const into = (c: Content, p: Promise<DiffFile>) =>
      p.then(
        (v) => {
          c.value = { ...v, readOnly: true };
          c.error = undefined;
        },
        (e) => {
          c.error = message(e);
        },
      );

    let seq = 0;
    async function show() {
      const n = ++seq;
      const st = current.value;
      if (!st) {
        view.value = undefined;
        return;
      }
      if (!detail.value || detail.value.hash !== st.hash) {
        const d = await busy(() => git.stash!(st.hash));
        if (!d || n !== seq) return;
        detail.value = d;
      }
      const p = picked.value;
      const target = p ? p.ref : null;
      if (target === null || !git.compare) {
        const d = detail.value!;
        view.value = {
          key: `stash:${st.hash}`,
          files: ro(d.files),
          oldLabel: d.parents[0] ? d.parents[0].slice(0, 10) : "",
          newLabel: st.ref,
          load: (c) => into(c, git.stashDiff!(st.hash, c.file.path, c.file.from, (c.file.status || "").trim() === "?")),
        };
        return;
      }
      const files = await busy(() => git.compare!(st.hash, target));
      if (!files || n !== seq) return;
      const other = p!.kind === "stash" ? (stashes.value.find((s) => s.hash === target)?.ref ?? short(target)) : p!.label;
      view.value = {
        key: `stashcmp:${st.hash}:${p!.kind}:${target}`,
        files: ro(files),
        oldLabel: st.ref,
        newLabel: other,
        title: `${st.ref} → ${other}`,
        load: (c) => into(c, git.compareDiff!(st.hash, target, c.file.path, c.file.from)),
      };
    }
    watch(selected, () => (picked.value = null));
    watch([selected, picked], () => void show());

    // the dialogs: stash (new), unstash, drop, clear
    const dialog = ref<"" | "new" | "unstash" | "drop" | "clear">("");
    const form = ref({ message: "", untracked: true, keepIndex: false, pop: false, index: false, branch: "" });
    const open = (d: typeof dialog.value) => {
      form.value = { message: "", untracked: true, keepIndex: false, pop: false, index: false, branch: "" };
      dialog.value = d;
    };
    const running = ref(false);
    async function run() {
      const st = current.value;
      const f = form.value;
      running.value = true;
      try {
        let done: unknown;
        switch (dialog.value) {
          case "new":
            done = await busy(() => git.stashNew!({ message: f.message, untracked: f.untracked, keepIndex: f.keepIndex }));
            break;
          case "unstash":
            if (!st) return;
            done = await busy(() =>
              f.branch.trim() ? git.stashBranch!(st.ref, f.branch.trim()).then(() => true) : git.stashApply!(st.ref, f.pop, f.index).then(() => true),
            );
            break;
          case "drop":
            if (!st) return;
            done = await busy(() => git.stashDrop!(st.ref).then(() => true));
            break;
          case "clear":
            done = await busy(() => git.stashClear!().then(() => true));
            break;
        }
        if (done === undefined) return;
        if (dialog.value === "new" || dialog.value === "unstash") emit("changed");
        dialog.value = "";
        await load();
      } finally {
        running.value = false;
      }
    }

    const dialogs = () => (
      <VDialog modelValue={!!dialog.value} {...{ "onUpdate:modelValue": (v: boolean) => !v && (dialog.value = "") }} maxWidth={480}>
        <VCard data-git-stash-dialog={dialog.value}>
          <VCardTitle class="text-subtitle-1">
            {{ new: m.value.stashChanges, unstash: `${m.value.unstash} ${current.value?.ref ?? ""}`, drop: m.value.dropStash, clear: m.value.clearStashes, "": "" }[dialog.value]}
          </VCardTitle>
          <VCardText>
            {dialog.value === "new" && (
              <>
                <VTextField modelValue={form.value.message} {...{ "onUpdate:modelValue": (v: string | null) => (form.value.message = v ?? "") }}
                  label={m.value.stashMessage} density="compact" variant="outlined" hideDetails autofocus class="mb-2" data-git-stash-message
                  onKeydown={(e: KeyboardEvent) => e.key === "Enter" && void run()} />
                <VCheckbox modelValue={form.value.untracked} {...{ "onUpdate:modelValue": (v: boolean) => (form.value.untracked = v) }}
                  label={m.value.includeUntracked} density="compact" hideDetails data-git-stash-untracked />
                <VCheckbox modelValue={form.value.keepIndex} {...{ "onUpdate:modelValue": (v: boolean) => (form.value.keepIndex = v) }}
                  label={m.value.keepIndex} density="compact" hideDetails />
              </>
            )}
            {dialog.value === "unstash" && (
              <>
                <VCheckbox modelValue={form.value.pop} {...{ "onUpdate:modelValue": (v: boolean) => (form.value.pop = v) }}
                  label={m.value.popStash} density="compact" hideDetails disabled={!!form.value.branch.trim()} data-git-stash-pop />
                <VCheckbox modelValue={form.value.index} {...{ "onUpdate:modelValue": (v: boolean) => (form.value.index = v) }}
                  label={m.value.reinstateIndex} density="compact" hideDetails disabled={!!form.value.branch.trim()} />
                <VTextField modelValue={form.value.branch} {...{ "onUpdate:modelValue": (v: string | null) => (form.value.branch = v ?? "") }}
                  label={m.value.asNewBranch} density="compact" variant="outlined" hideDetails class="mt-2" prependInnerIcon="mdi-source-branch-plus"
                  data-git-stash-branch />
              </>
            )}
            {dialog.value === "drop" && <div>{m.value.dropStashConfirm}</div>}
            {dialog.value === "clear" && <div>{m.value.clearStashesConfirm}</div>}
          </VCardText>
          <VCardActions>
            <VSpacer />
            <VBtn variant="text" onClick={() => (dialog.value = "")}>{m.value.cancel}</VBtn>
            <VBtn variant="flat" color={dialog.value === "drop" || dialog.value === "clear" ? "error" : "primary"} loading={running.value}
              data-git-stash-run onClick={() => void run()}>
              {{ new: m.value.stashChanges, unstash: form.value.pop && !form.value.branch.trim() ? m.value.popStash.split(" (")[0] : m.value.applyStash,
                drop: m.value.dropStash, clear: m.value.clearStashes, "": "" }[dialog.value]}
            </VBtn>
          </VCardActions>
        </VCard>
      </VDialog>
    );

    // the bar of the compare: with what (a dialog; the chip clears it)
    const compareBar = () => (
      <div class="gad-git__git-with" data-git-stash-compare>
        <span>{m.value.stashKind}</span>
        <RefPicker api={git} messages={m.value} branches={props.branches} allow={["work", "branch", "commit", "stash"]}
          exclude={selected.value} clearable modelValue={picked.value} placeholder={m.value.stashChangesOf}
          title={m.value.stashKind} {...{ "onUpdate:modelValue": (v: PickedRef | null) => (picked.value = v) }}
          data-git-stash-compare-with="" />
      </div>
    );

    return () => {
      const st = current.value;
      const v = view.value;
      return (
        <div class="gad-git__git-cols" data-git-stashes>
          <div class="gad-git__git-branches" style={{ width: `${listW.size.value}px` }}>
            <div class="gad-git__git-head">
              <span>{m.value.stashes}</span>
              <span class="gad-git__git-spacer" />
              <TipBtn icon="mdi-plus" tip={m.value.stashChanges} color="primary" data-git-stash-new onClick={() => open("new")} />
              <TipBtn icon="mdi-delete-sweep-outline" tip={m.value.clearStashes} disabled={!stashes.value.length}
                data-git-stash-clear onClick={() => open("clear")} />
              <HelpButton id="stashes" title={m.value.stashes} text={m.value.helpStashes} />
            </div>
            {!stashes.value.length && (
              <div class="pa-3 text-medium-emphasis text-body-2" data-git-no-stashes>
                <div class="mb-2">{m.value.noStashes}</div>
                <VBtn size="small" variant="tonal" color="primary" prependIcon="mdi-archive-arrow-down-outline" class="text-none"
                  onClick={() => open("new")}>
                  {m.value.stashChanges}
                </VBtn>
              </div>
            )}
            {stashes.value.map((s) => (
              <div
                key={s.hash}
                class={["gad-git__git-commit", "gad-git__git-stash", { "gad-git__git-commit--active": s.hash === selected.value }]}
                title={`${s.ref} — ${s.branch ?? ""} — ${shortDate(s.date)}\n${s.message}`}
                data-git-stash={s.ref}
                onClick={() => (selected.value = s.hash)}
              >
                <i class="mdi mdi-archive-outline gad-git__git-dot" />
                <span class="gad-git__git-ref">{s.ref.replace(/^stash/, "")}</span>
                <span class="gad-git__git-ellipsis gad-git__git-subject">{s.message}</span>
                {s.branch && <span class="gad-git__git-meta">{s.branch}</span>}
                <span class="gad-git__git-meta">{shortDate(s.date)}</span>
              </div>
            ))}
          </div>
          <ResizeHandle onStart={listW.begin} onDrag={(dx: number) => listW.drag(dx)} onReset={listW.reset} />
          <div class="gad-git__git-detail">
            {!st ? (
              <div class="pa-4 text-medium-emphasis">{m.value.chooseStash}</div>
            ) : (
              <>
                <div class="gad-git__git-message" data-git-stash-head style={{ height: `${headH.size.value}px` }}>
                  <div class="gad-git__git-message-head">
                    <code>{st.ref}</code>
                    {st.branch && <span>{st.branch}</span>}
                    <span>{shortDate(st.date)}</span>
                    <span class="gad-git__git-spacer" />
                    <TipBtn icon="mdi-archive-arrow-up-outline" tip={m.value.unstash} color="primary" data-git-unstash onClick={() => open("unstash")} />
                    <TipBtn icon="mdi-delete-outline" tip={m.value.dropStash} color="error" data-git-stash-drop onClick={() => open("drop")} />
                  </div>
                  <pre>{st.message}</pre>
                </div>
                <ResizeHandle direction="row" onStart={headH.begin} onDrag={(dy: number) => headH.drag(dy)} onReset={headH.reset} />
                {git.compare && compareBar()}
                {v?.title && <div class="gad-git__git-compare-title" data-git-compare-title>{v.title}</div>}
                {v && (
                  <div class="gad-git__git-fill">
                    {h(DiffBrowser, {
                      ...diffLabels(m.value),
                      root: props.root,
                      key: v.key,
                      files: v.files,
                      load: v.load,
                      dark: props.dark,
                      height: "100%",
                      oldLabel: v.oldLabel,
                      newLabel: v.newLabel,
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          {dialogs()}
        </div>
      );
    };
  },
});
