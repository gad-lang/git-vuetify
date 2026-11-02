// RefPicker: a ref of the repository chosen in a dialog — the working files,
// a branch (its tip or, by its log, a commit of it), a stash — and shown as a
// chip (its icon, its name or short hash, its date; × clears it, when it may
// be cleared). allow says what may be chosen; exclude, a hash not offered
// (a stash compared with others).
import { computed, defineComponent, ref, watch, type PropType } from "vue";
import { VBtn, VCard, VCardText, VCardTitle, VChip, VDialog, VSpacer, VTab, VTabs, VTextField } from "./vuetify";
import type { GitMessages } from "./messages";
import type { GitApi, GitBranch, GitCommit, GitStash } from "./api";

/** PickedRef is what a RefPicker chose: its kind, its ref (the branch's
 * name, the commit's or the stash's hash; "" the working files), what is
 * shown of it. */
export interface PickedRef {
  kind: "work" | "branch" | "commit" | "stash";
  ref: string;
  label: string;
  date?: string;
  branch?: string;
}

export type RefKind = PickedRef["kind"];

const PAGE = 50;
const shortDate = (s?: string) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
};
const ICON: Record<RefKind, string> = {
  work: "mdi-folder-outline",
  branch: "mdi-source-branch",
  commit: "mdi-source-commit",
  stash: "mdi-archive-outline",
};

/** branchRef is the PickedRef of the branch b. */
export const branchRef = (b: GitBranch | string): PickedRef =>
  typeof b === "string" ? { kind: "branch", ref: b, label: b } : { kind: "branch", ref: b.name, label: b.name };

export default defineComponent({
  name: "RefPicker",
  props: {
    api: { type: Object as PropType<GitApi>, required: true },
    messages: { type: Object as PropType<GitMessages>, required: true },
    branches: { type: Array as PropType<GitBranch[]>, default: () => [] },
    modelValue: { type: Object as PropType<PickedRef | null>, default: null },
    /** what may be chosen */
    allow: { type: Array as PropType<RefKind[]>, default: () => ["branch", "commit"] },
    /** × clears it */
    clearable: { type: Boolean, default: false },
    /** a hash not offered */
    exclude: { type: String, default: "" },
    /** shown with nothing chosen */
    placeholder: { type: String, default: "" },
    /** the dialog's title */
    title: { type: String, default: "" },
  },
  emits: { "update:modelValue": (_v: PickedRef | null) => true },
  setup(props, { emit, attrs }) {
    const m = computed(() => props.messages);
    const can = (k: RefKind) => props.allow.includes(k);
    const open = ref(false);
    const tab = ref<"branch" | "stash">(can("branch") ? "branch" : "stash");
    const search = ref("");
    const branch = ref("");
    const commits = ref<GitCommit[]>([]);
    const more = ref(false);
    const stashes = ref<GitStash[]>([]);
    const error = ref("");

    const pick = (v: PickedRef | null) => {
      emit("update:modelValue", v);
      open.value = false;
    };
    const fail = (e: unknown) => (error.value = String((e as { message?: string })?.message || e));

    async function loadLog(next = false) {
      if (!branch.value) return;
      try {
        const cs = await props.api.log(branch.value, next ? commits.value.length : 0, PAGE);
        commits.value = next ? [...commits.value, ...cs] : cs;
        more.value = cs.length === PAGE;
      } catch (e) {
        fail(e);
      }
    }
    watch(branch, () => {
      commits.value = [];
      if (can("commit")) void loadLog();
    });
    watch(open, async (v) => {
      if (!v) return;
      error.value = "";
      search.value = "";
      branch.value = props.modelValue?.branch ?? (props.modelValue?.kind === "branch" ? props.modelValue.ref : "");
      if (can("stash") && props.api.stashes) {
        try {
          stashes.value = (await props.api.stashes()).filter((s) => s.hash !== props.exclude);
        } catch (e) {
          fail(e);
        }
      }
    });

    const shown = computed(() => {
      const q = search.value.trim().toLowerCase();
      return props.branches.filter((b) => !q || b.name.toLowerCase().includes(q));
    });
    const choose = (b: GitBranch) => {
      if (can("commit")) branch.value = b.name;
      else pick(branchRef(b));
    };

    const row = (key: string, icon: string, text: string, meta: string, active: boolean, onClick: () => void, data: Record<string, string>) => (
      <div key={key} class={["gad-git__picker-row", { "gad-git__picker-row--active": active }]} onClick={onClick} {...data}>
        <i class={["mdi", icon]} />
        <span class="gad-git__git-ellipsis">{text}</span>
        {meta && <span class="gad-git__git-meta">{meta}</span>}
      </div>
    );

    const chip = () => {
      const v = props.modelValue;
      return (
        <VChip
          size="small"
          variant={v ? "tonal" : "outlined"}
          color={v ? "primary" : undefined}
          prependIcon={v ? ICON[v.kind] : "mdi-plus-circle-outline"}
          closable={props.clearable && !!v}
          class="gad-git__picker-chip"
          title={v ? `${v.label}${v.date ? ` — ${shortDate(v.date)}` : ""}` : props.placeholder}
          onClick={() => (open.value = true)}
          {...{ "onClick:close": () => emit("update:modelValue", null) }}
          {...attrs}
        >
          {v ? (
            <>
              <span class="gad-git__git-ellipsis">{v.label}</span>
              {v.date && <span class="gad-git__picker-date">{shortDate(v.date)}</span>}
            </>
          ) : (
            props.placeholder || m.value.pickRef
          )}
        </VChip>
      );
    };

    return () => (
      <>
        {chip()}
        <VDialog modelValue={open.value} {...{ "onUpdate:modelValue": (v: boolean) => (open.value = v) }} maxWidth={760}>
          <VCard class="gad-git__picker" data-git-picker>
            <VCardTitle class="d-flex align-center text-subtitle-1">
              {props.title || m.value.pickRef}
              <VSpacer />
              <VBtn size="small" variant="text" icon="mdi-close" title={m.value.cancel} onClick={() => (open.value = false)} />
            </VCardTitle>
            <VCardText class="pt-0">
              {error.value && <div class="text-error text-body-2 mb-2">{error.value}</div>}
              {can("work") &&
                row("work", ICON.work, m.value.workingFiles, "", props.modelValue?.kind === "work", () =>
                  pick({ kind: "work", ref: "", label: m.value.workingFiles }), { "data-git-pick-work": "" })}
              {can("branch") && can("stash") && (
                <VTabs modelValue={tab.value} {...{ "onUpdate:modelValue": (v: "branch" | "stash") => (tab.value = v) }} density="compact" class="mb-2">
                  <VTab value="branch" prependIcon="mdi-source-branch">{m.value.branches}</VTab>
                  <VTab value="stash" prependIcon="mdi-archive-outline">{m.value.stashes}</VTab>
                </VTabs>
              )}
              {can("branch") && (tab.value === "branch" || !can("stash")) && (
                <div class="gad-git__picker-cols">
                  <div class="gad-git__picker-col">
                    <VTextField modelValue={search.value} {...{ "onUpdate:modelValue": (v: string | null) => (search.value = v ?? "") }}
                      placeholder={m.value.search} prependInnerIcon="mdi-magnify" density="compact" variant="outlined" hideDetails
                      clearable class="mb-1 gad-git__picker-search" autofocus />
                    <div class="gad-git__picker-list">
                      {shown.value.map((b) =>
                        row(b.name, b.remote ? "mdi-cloud-outline" : "mdi-source-branch", b.name, b.default ? m.value.defaultBranch : "",
                          b.name === branch.value, () => choose(b), { "data-git-pick-branch": b.name }),
                      )}
                    </div>
                  </div>
                  {can("commit") && (
                    <div class="gad-git__picker-col gad-git__picker-col--log">
                      {!branch.value ? (
                        <div class="pa-2 text-medium-emphasis text-body-2">{m.value.chooseBranch}</div>
                      ) : (
                        <div class="gad-git__picker-list">
                          {row("tip", ICON.branch, `${branch.value} — ${m.value.branchTip}`, "", false,
                            () => pick(branchRef(branch.value)), { "data-git-pick-tip": branch.value })}
                          {commits.value.map((c) =>
                            row(c.hash, ICON.commit, `${c.hash.slice(0, 8)} · ${c.subject}`, shortDate(c.date), props.modelValue?.ref === c.hash,
                              () => pick({ kind: "commit", ref: c.hash, label: `${branch.value} @ ${c.hash.slice(0, 8)}`, date: c.date, branch: branch.value }),
                              { "data-git-pick-commit": c.hash }),
                          )}
                          {more.value && (
                            <VBtn size="small" variant="text" block onClick={() => loadLog(true)}>{m.value.more}</VBtn>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {can("stash") && (tab.value === "stash" || !can("branch")) && (
                <div class="gad-git__picker-list">
                  {!stashes.value.length && <div class="pa-2 text-medium-emphasis text-body-2">{m.value.noStashes}</div>}
                  {stashes.value.map((s) =>
                    row(s.hash, ICON.stash, `${s.ref} · ${s.message}`, shortDate(s.date), props.modelValue?.ref === s.hash,
                      () => pick({ kind: "stash", ref: s.hash, label: `${s.ref} · ${s.message}`, date: s.date }), { "data-git-pick-stash": s.ref }),
                  )}
                </div>
              )}
            </VCardText>
          </VCard>
        </VDialog>
      </>
    );
  },
});
