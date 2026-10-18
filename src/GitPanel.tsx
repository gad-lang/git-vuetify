// GitPanel: a repository (api: GitApi), browsed — read only —, in
// three modes:
//
//   - Log: the commits of the branch navigated (chosen in the bar or the list
//     of branches; the repository's default one at first), as a graph
//     (gitGraph). A commit chosen shows its full message and the files it
//     changed, in the diff browser — each compared with the commit before,
//     its downloads (its content, its patch) in its toolbar —; Ctrl+click on
//     another compares the two commits.
//   - File history: the commits of the branch that changed a file (the one
//     open in the editor, or typed), renames followed. A commit chosen shows
//     the file's change in it; Ctrl+click on another compares the file in the
//     two; "compare with" compares it, as the commit has it, with a branch's
//     or the working one.
//   - Compare: what changed from a ref to another — branches, commits (their
//     hashes) or the working files —, file by file.
//
// The log and the history are filtered (the filter icon: a search, authors,
// a file's name, content, the message, a period); a file's view shows, by
// its blame button, who changed each line last.
import { computed, defineComponent, h, onMounted, reactive, ref, watch, type PropType } from "vue";
import { VBtn, VBtnToggle, VCard, VCardActions, VCardText, VChip, VMenu, VProgressCircular, VSelect, VSpacer, VTextField } from "./vuetify";
import { diffLabels, useGitMessages, type GitMessages } from "./messages";
import DiffBrowser from "./diff/DiffBrowser.vue";
import type { Content, DiffFile } from "./diff/diffBrowserContext";
import type { GitApi, GitBlame, GitBranch, GitCommit, GitCommitDetail, GitLogFilter } from "./api";
import BlameView, { NOT_COMMITTED } from "./BlameView";
import { graphRows, type GraphRow } from "./gitGraph";
import { ResizeHandle, useStoredSize } from "./resize";
import HelpButton from "./HelpButton";

const message = (e: unknown) => String((e as { message?: string })?.message || e);
const PAGE = 100;
const LANE = 12; // a lane's width, px
const ROW = 24; // a commit's row's height, px
const COLORS = ["#1e88e5", "#43a047", "#e53935", "#fb8c00", "#8e24aa", "#00acc1", "#6d4c41", "#d81b60"];
const color = (lane: number) => COLORS[lane % COLORS.length];

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
};

// Graph is a commit's row of the graph: the lanes through it, into its node
// and out of it, the node.
function Graph(props: { row: GraphRow }) {
  const r = props.row;
  const x = (lane: number) => lane * LANE + LANE / 2;
  const mid = ROW / 2;
  return (
    <svg class="gad-git__git-graph" width={r.width * LANE} height={ROW}>
      {r.through.map(([a, b]) => (
        <line x1={x(a)} y1={0} x2={x(b)} y2={ROW} stroke={color(a)} stroke-width={2} />
      ))}
      {r.into.map((j) => (
        <path d={`M${x(j)} 0 C ${x(j)} ${mid / 2}, ${x(r.col)} ${mid / 2}, ${x(r.col)} ${mid}`} stroke={color(j)} stroke-width={2} fill="none" />
      ))}
      {r.out.map((j) => (
        <path d={`M${x(r.col)} ${mid} C ${x(r.col)} ${mid + mid / 2}, ${x(j)} ${mid + mid / 2}, ${x(j)} ${ROW}`} stroke={color(j)} stroke-width={2} fill="none" />
      ))}
      <circle cx={x(r.col)} cy={mid} r={4} fill={color(r.col)} />
    </svg>
  );
}

type Mode = "log" | "file" | "compare";
const MODE_KEY = "gad-ide.git.mode";
// WORK is, as a compare's side, the working files
const WORK = "@work";

type Filter = Required<GitLogFilter>;
const emptyFilter = (): Filter => ({ q: "", authors: [], name: "", content: "", message: "", since: "", until: "" });
// the filters applied: kept while the page is open (the panel closed and
// opened again too)
const kept = reactive<Filter>(emptyFilter());
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// View is what the detail shows: files in the diff browser, how a file's
// diff is loaded, the labels of its sides, a head above it.
interface View {
  key: string;
  files: DiffFile[];
  load: (c: Content) => Promise<void>;
  oldLabel: string;
  newLabel: string;
  commit?: GitCommitDetail;
  title?: string;
  // the ref whose files the blame is of ("": the working ones); none, no blame
  blameRef?: string;
}

const short = (ref: string) => (/^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 10) : ref);

export default defineComponent({
  name: "GitPanel",
  props: {
    /** the repository's API */
    api: { type: Object as PropType<GitApi>, required: true },
    /** the diff editors' theme */
    dark: { type: Boolean, default: false },
    /** the file open (in an editor beside): the file history's, until another is typed */
    openPath: { type: String, default: "" },
    /** the texts, over the app's vue-i18n's (gadGit) and the defaults */
    messages: { type: Object as PropType<Partial<GitMessages>>, default: undefined },
  },
  // slots: actions — at the end of the bar (an expand button)
  setup(props, { slots }) {
    const git = props.api;
    const m = useGitMessages(() => props.messages);
    const ctx = { openPath: computed(() => props.openPath), dark: computed(() => props.dark) };
    const canCompare = !!(git.compare && git.compareDiff);

    const readMode = (): Mode => {
      try {
        const v = localStorage.getItem(MODE_KEY);
        if (v === "log" || v === "file" || (v === "compare" && canCompare)) return v;
      } catch { /* no storage */ }
      return "log";
    };
    const mode = ref<Mode>(readMode());
    watch(mode, (v) => {
      try { localStorage.setItem(MODE_KEY, v); } catch { /* no storage */ }
    });

    const branches = ref<GitBranch[]>([]);
    const branch = ref("");
    const commits = ref<GitCommit[]>([]);
    const more = ref(false);
    const selected = ref("");
    // the commit Ctrl+clicked: compared with the selected one
    const second = ref("");
    const view = ref<View>();
    const error = ref("");
    const loading = ref(0);
    // the file of the history: the one open in the editor at first
    const filePath = ref(ctx.openPath.value || "");
    // the file follows the one open in the editor, until another is typed
    watch(
      () => ctx.openPath.value,
      (now, was) => {
        if (now && (!filePath.value.trim() || filePath.value === was)) filePath.value = now;
      },
    );
    // the history's commit compared with: a branch, the working file (WORK), none
    const compareWith = ref("");
    // the compare's sides
    const compareA = ref("");
    const compareB = ref(WORK);

    // the filters: those applied (kept), the dialog's (draft), the search
    // (applied as typed)
    const applied = kept;
    const draft = reactive<Filter>(emptyFilter());
    const filterOpen = ref(false);
    const search = ref(applied.q);
    const authorItems = ref<{ title: string; value: string }[]>([]);
    // what the log is asked: a file's history has no name filter
    const filterReq = computed<Filter>(() => ({ ...applied, authors: [...applied.authors], name: mode.value === "file" ? "" : applied.name }));
    const activeCount = computed(() => {
      const f = filterReq.value;
      return [f.q, f.name, f.content, f.message, f.since, f.until].filter(Boolean).length + (f.authors.length ? 1 : 0);
    });
    const filtered = computed(() => activeCount.value > 0);
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    watch(search, (v) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => (applied.q = v.trim()), 400);
    });
    watch(() => applied.q, (v) => {
      if (v !== search.value.trim()) search.value = v;
    });
    async function openFilters(open: boolean) {
      filterOpen.value = open;
      if (!open) return;
      Object.assign(draft, { ...applied, authors: [...applied.authors] });
      const path = mode.value === "file" ? filePath.value.trim() : "";
      const as = await busy(() => git.authors?.(branch.value || "HEAD", path || undefined) ?? Promise.resolve([]));
      if (as) {
        const items = as.map((a) => ({ title: `${a.name}${a.email ? ` <${a.email}>` : ""} (${a.commits})`, value: a.email ? `${a.name} <${a.email}>` : a.name }));
        // the authors chosen before, kept among them
        for (const v of draft.authors) if (!items.some((i) => i.value === v)) items.push({ title: v, value: v });
        authorItems.value = items;
      }
    }
    function applyFilters() {
      Object.assign(applied, { ...draft, q: applied.q, authors: [...draft.authors] });
      filterOpen.value = false;
    }
    function clearFilters() {
      Object.assign(applied, emptyFilter());
      Object.assign(draft, emptyFilter());
      search.value = "";
    }
    const lastDays = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      draft.since = isoDay(d);
      draft.until = "";
    };

    // busy runs f, its error shown
    async function busy<T>(f: () => Promise<T>): Promise<T | undefined> {
      loading.value++;
      try {
        const v = await f();
        error.value = "";
        return v;
      } catch (e) {
        error.value = message(e);
      } finally {
        loading.value--;
      }
    }

    async function loadBranches() {
      const bs = await busy(() => git.branches());
      if (!bs) return;
      branches.value = bs;
      // the branch navigated: kept, else the repository's default one
      if (!bs.some((b) => b.name === branch.value))
        branch.value = (bs.find((b) => b.default) ?? bs.find((b) => b.current) ?? bs[0])?.name ?? "HEAD";
      if (!compareA.value) compareA.value = branch.value;
    }

    // the log of the branch — of the file, in its history —: its first page,
    // or the next (more)
    let logSeq = 0;
    async function loadLog(next = false) {
      const n = ++logSeq;
      if (mode.value === "compare") return;
      const path = mode.value === "file" ? filePath.value.trim() : "";
      if (mode.value === "file" && !path) {
        commits.value = [];
        more.value = false;
        return;
      }
      const ref_ = branch.value || "HEAD";
      const skip = next ? commits.value.length : 0;
      const cs = await busy(() => git.log(ref_, skip, PAGE, path || undefined, filtered.value ? filterReq.value : undefined));
      if (!cs || n !== logSeq) return;
      commits.value = next ? [...commits.value, ...cs] : cs;
      more.value = cs.length === PAGE;
    }
    const clearDetail = () => {
      selected.value = "";
      second.value = "";
      view.value = undefined;
    };
    watch(() => JSON.stringify(filterReq.value), () => {
      if (mode.value === "compare") return;
      clearDetail();
      void loadLog();
    });
    watch([branch, mode], () => {
      clearDetail();
      void loadLog();
      if (mode.value === "compare") void showCompare();
    });
    let fileTimer: ReturnType<typeof setTimeout> | undefined;
    watch(filePath, () => {
      if (mode.value !== "file") return;
      clearTimeout(fileTimer);
      fileTimer = setTimeout(() => {
        clearDetail();
        void loadLog();
      }, 400);
    });

    const ro = (files: DiffFile[]) => files.map((f) => ({ ...f, readOnly: true }));
    const into = (c: Content, p: Promise<DiffFile>): Promise<void> =>
      p.then(
        (v) => {
          c.value = { ...v, readOnly: true };
          c.error = undefined;
        },
        (e) => {
          c.error = message(e);
        },
      );
    const commitOf = (hash: string) => commits.value.find((c) => c.hash === hash);
    // older, newer: the two commits in the log's order (older below)
    const ordered = (a: string, b: string) => {
      const ia = commits.value.findIndex((c) => c.hash === a);
      const ib = commits.value.findIndex((c) => c.hash === b);
      return ia > ib ? [a, b] : [b, a];
    };

    // the view of a commit: its message, its files from its first parent
    const commitView = (d: GitCommitDetail): View => ({
      key: d.hash, files: ro(d.files), commit: d, blameRef: d.hash,
      oldLabel: d.parents[0] ? d.parents[0].slice(0, 10) : m.value.noParent, newLabel: d.hash.slice(0, 10),
      load: (c) => into(c, git.commitDiff(d.hash, c.file.path, c.file.from)),
    });

    // the blames: the files shown so (their paths, of the view), and those
    // had (by ref and path)
    const blameOn = reactive(new Set<string>());
    const blames = reactive(new Map<string, { data?: GitBlame; error: string }>());
    watch(view, () => blameOn.clear());
    function blameOf(ref_: string, path: string) {
      const k = ref_ + "\x00" + path;
      if (!blames.has(k)) {
        blames.set(k, { error: "" });
        const e = blames.get(k)!;
        git.blame!(ref_, path).then(
          (d) => (e.data = d),
          (err) => (e.error = message(err)),
        );
      }
      return blames.get(k)!;
    }
    // a blame's commit chosen: shown (its files, its message)
    function openCommit(hash: string) {
      if (hash === NOT_COMMITTED) return;
      selected.value = hash;
      second.value = "";
      if (compareWith.value) compareWith.value = "";
      else void show();
    }

    let viewSeq = 0;
    async function show() {
      const n = ++viewSeq;
      const set = (v: View | undefined) => {
        if (n === viewSeq) view.value = v;
      };
      const sel = selected.value;
      if (!sel) return set(undefined);
      if (mode.value === "log") {
        if (second.value) {
          const [a, b] = ordered(sel, second.value);
          const files = await busy(() => git.compare!(a, b));
          if (files)
            set({ key: `cmp:${a}:${b}`, files: ro(files), oldLabel: short(a), newLabel: short(b), blameRef: b,
              title: `${short(a)} → ${short(b)}`, load: (c) => into(c, git.compareDiff!(a, b, c.file.path, c.file.from)) });
          return;
        }
        const d = await busy(() => git.commit(sel));
        if (d) set(commitView(d));
        return;
      }
      // the file's history
      const c = commitOf(sel);
      if (!c) {
        // a commit not of the history (a blame's): the commit
        const d = await busy(() => git.commit(sel));
        if (d) set(commitView(d));
        return;
      }
      const path = c.path || filePath.value;
      if (second.value && canCompare) {
        const [a, b] = ordered(sel, second.value);
        const ca = commitOf(a)!, cb = commitOf(b)!;
        const pa = ca.path || path, pb = cb.path || path;
        set({ key: `fcmp:${a}:${b}:${pb}`, files: ro([{ path: pb, from: pa !== pb ? pa : undefined, status: pa !== pb ? "R" : "M" }]),
          oldLabel: short(a), newLabel: short(b), title: `${short(a)} → ${short(b)}`, blameRef: b,
          load: (x) => into(x, git.compareDiff!(a, b, x.file.path, x.file.from)) });
        return;
      }
      if (compareWith.value && canCompare) {
        const target = compareWith.value === WORK ? "" : compareWith.value;
        const now = filePath.value.trim() || path;
        set({ key: `fwith:${sel}:${compareWith.value}:${now}`, files: ro([{ path: now, from: path !== now ? path : undefined, status: path !== now ? "R" : "M" }]),
          oldLabel: short(sel), newLabel: target ? short(target) : m.value.workingFiles,
          title: `${short(sel)} → ${target ? short(target) : m.value.workingFiles}`, blameRef: target,
          load: (x) => into(x, git.compareDiff!(sel, target, x.file.path, x.file.from)) });
        return;
      }
      const d = await busy(() => git.commit(sel));
      if (!d) return;
      const f = d.files.find((x) => x.path === path) ?? { path, from: c.from, status: c.from ? "R" : "M" };
      set({ key: `file:${sel}:${path}`, files: ro([f]), commit: d, blameRef: d.hash,
        oldLabel: d.parents[0] ? d.parents[0].slice(0, 10) : m.value.noParent, newLabel: d.hash.slice(0, 10),
        load: (x) => into(x, git.commitDiff(d.hash, x.file.path, x.file.from)) });
    }

    async function showCompare() {
      const n = ++viewSeq;
      const a = compareA.value.trim();
      const b = compareB.value === WORK ? "" : compareB.value.trim();
      if (!a || !canCompare) {
        view.value = undefined;
        return;
      }
      const files = await busy(() => git.compare!(a, b));
      if (!files || n !== viewSeq) return;
      const bl = b ? short(b) : m.value.workingFiles;
      view.value = { key: `refs:${a}:${b}`, files: ro(files), oldLabel: short(a), newLabel: bl, title: `${short(a)} → ${bl}`, blameRef: b,
        load: (c) => into(c, git.compareDiff!(a, b, c.file.path, c.file.from)) };
    }
    let cmpTimer: ReturnType<typeof setTimeout> | undefined;
    watch([compareA, compareB], () => {
      if (mode.value !== "compare") return;
      clearTimeout(cmpTimer);
      cmpTimer = setTimeout(() => void showCompare(), 400);
    });
    watch(compareWith, () => void show());

    // a click chooses the commit; Ctrl (⌘) + click, another one compared with it
    function select(hash: string, e?: MouseEvent) {
      if ((e?.ctrlKey || e?.metaKey) && selected.value && selected.value !== hash && canCompare) {
        second.value = second.value === hash ? "" : hash;
      } else {
        if (selected.value === hash && !second.value) return;
        selected.value = hash;
        second.value = "";
      }
      void show();
    }

    onMounted(async () => {
      await loadBranches();
      if (mode.value === "compare") void showCompare();
    });
    const refresh = async () => {
      await loadBranches();
      await loadLog();
      if (mode.value === "compare") await showCompare();
      else if (selected.value) await show();
    };

    const rows = computed(() => graphRows(commits.value));
    const local = computed(() => branches.value.filter((b) => !b.remote));
    const remote = computed(() => branches.value.filter((b) => b.remote));

    // the downloads of a file of the commit: its content there (not of one
    // deleted), its patch
    const fileButtons = (f: DiffFile) => {
      const v = view.value;
      const deleted = (f.status || "").trim().startsWith("D");
      const blameBtn = git.blame && v?.blameRef !== undefined && !deleted && (
        <VBtn size="small" variant={blameOn.has(f.path) ? "tonal" : "text"} color={blameOn.has(f.path) ? "primary" : undefined}
          icon="mdi-account-clock-outline" density="comfortable" title={m.value.blame}
          data-git-blame-toggle={blameOn.has(f.path) ? "on" : "off"}
          onClick={() => (blameOn.has(f.path) ? blameOn.delete(f.path) : blameOn.add(f.path))} />
      );
      const d = v?.commit;
      if (!d) return blameBtn || null;
      return [
        blameBtn,
        git.fileUrl && !deleted && (
          <VBtn size="small" variant="text" icon="mdi-file-download-outline" density="comfortable" title={m.value.downloadFile}
            href={git.fileUrl(d.hash, f.path)} download={f.path.slice(f.path.lastIndexOf("/") + 1)} data-git-download-file />
        ),
        git.patchUrl && (
          <VBtn size="small" variant="text" icon="mdi-file-compare" density="comfortable" title={m.value.downloadPatch}
            href={git.patchUrl(d.hash, f.path)} download data-git-download-patch />
        ),
      ];
    };

    const branchLabel = (b: GitBranch) => (b.default ? `${b.name} (${m.value.defaultBranch})` : b.name);
    const branchItem = (b: GitBranch) => (
      <div
        key={b.name}
        class={["gad-git__git-branch", { "gad-git__git-branch--active": b.name === branch.value }]}
        title={b.subject ? `${b.name}: ${b.subject}` : b.name}
        data-git-branch={b.name}
        onClick={() => (branch.value = b.name)}
      >
        <i class={["mdi", b.current ? "mdi-check-circle" : b.remote ? "mdi-cloud-outline" : "mdi-source-branch"]} />
        <span class="gad-git__git-ellipsis">{b.name}</span>
        {b.default && <span class="gad-git__git-default">{m.value.defaultBranch}</span>}
      </div>
    );
    // a select of the branches (and of the working files, withWork)
    const branchSelect = (value: string, onChange: (v: string) => void, attrs: Record<string, unknown>, withWork = false, none = "") => (
      <select class="gad-git__git-select" value={value} onChange={(e: Event) => onChange((e.target as HTMLSelectElement).value)} {...attrs}>
        {none && <option value="">{none}</option>}
        {withWork && <option value={WORK}>{m.value.workingFiles}</option>}
        {!branches.value.some((b) => b.name === value) && value && value !== WORK && <option value={value}>{short(value)}</option>}
        {branches.value.map((b) => (
          <option value={b.name}>{branchLabel(b)}</option>
        ))}
      </select>
    );
    // a ref typed or chosen: a branch, a commit's hash
    const refInput = (value: string, onChange: (v: string) => void, attrs: Record<string, unknown>, withWork = false) => (
      <span class="gad-git__git-ref-input">
        <input class="gad-git__git-select" list="gad-ide-git-refs" value={value === WORK ? m.value.workingFiles : value}
          onChange={(e: Event) => {
            const v = (e.target as HTMLInputElement).value.trim();
            onChange(withWork && (v === m.value.workingFiles || v === "") ? WORK : v);
          }} {...attrs} />
      </span>
    );

    // the widths of the branches and of the log, the height of the message:
    // dragged by their edges, kept across visits
    const branchesW = useStoredSize("gad-ide.git.branches", 180, 100, 600);
    const logW = useStoredSize("gad-ide.git.log", 380, 160, 1600);
    const messageH = useStoredSize("gad-ide.git.message", 120, 40, 1200);

    const diff = (v: View) => (
      <div class="gad-git__git-fill">
        {h(
          DiffBrowser,
          { ...diffLabels(m.value), key: v.key, files: v.files, load: v.load, dark: ctx.dark.value, height: "100%", oldLabel: v.oldLabel, newLabel: v.newLabel,
            altView: (f: DiffFile) => blameOn.has(f.path) },
          {
            toolbar: ({ file }: { file: DiffFile }) => fileButtons(file),
            view: ({ file }: { file: DiffFile }) => {
              const b = blameOf(v.blameRef ?? "", file.path);
              return <BlameView blame={b.data} error={b.error} binaryText={m.value.binary} notCommitted={m.value.notCommitted} onCommit={openCommit} />;
            },
          },
        )}
      </div>
    );

    const detail = () => {
      const v = view.value;
      if (!v) {
        return (
          <div class="pa-4 text-medium-emphasis">
            {mode.value === "file" && !filePath.value.trim() ? m.value.chooseFile : m.value.chooseCommit}
            {canCompare && <div class="text-caption mt-1">{m.value.compareHint}</div>}
          </div>
        );
      }
      const d = v.commit;
      return (
        <>
          {mode.value === "file" && canCompare && !second.value && (
            <div class="gad-git__git-with" data-git-compare-with-bar>
              <span>{m.value.compareWith}</span>
              {branchSelect(compareWith.value, (x) => (compareWith.value = x), { "data-git-compare-with": "" }, true, "—")}
            </div>
          )}
          {d && !compareWith.value ? (
            <>
              <div class="gad-git__git-message" data-git-message style={{ height: `${messageH.size.value}px` }}>
                <div class="gad-git__git-message-head">
                  <code>{d.hash.slice(0, 10)}</code>
                  <span>{d.author} &lt;{d.email}&gt;</span>
                  <span>{shortDate(d.date)}</span>
                  {git.patchUrl && (
                    <VBtn size="x-small" variant="tonal" prependIcon="mdi-download" href={git.patchUrl(d.hash)} download title={m.value.downloadCommitPatch} data-git-download-commit-patch>
                      {m.value.patch}
                    </VBtn>
                  )}
                </div>
                <pre>{d.message}</pre>
              </div>
              <ResizeHandle direction="row" onStart={messageH.begin} onDrag={(dy: number) => messageH.drag(dy)} onReset={messageH.reset} />
            </>
          ) : (
            v.title && <div class="gad-git__git-compare-title" data-git-compare-title>{v.title}</div>
          )}
          {diff(v)}
        </>
      );
    };

    // the filters' chips: one each applied, its x takes it out
    const filterChips = () => {
      const f = filterReq.value;
      const chip = (key: string, label: string, clear: () => void) => (
        <VChip key={key} size="x-small" closable class="me-1 mb-1" data-git-filter-chip={key} {...{ "onClick:close": clear }}>{label}</VChip>
      );
      return [
        f.q && chip("q", `${m.value.search}: ${f.q}`, () => (applied.q = "")),
        f.authors.length > 0 && chip("authors", `${m.value.authors}: ${f.authors.map((a) => a.replace(/ <.*>$/, "")).join(", ")}`, () => (applied.authors = [])),
        f.name && chip("name", `${m.value.fileName}: ${f.name}`, () => (applied.name = "")),
        f.content && chip("content", `${m.value.content}: ${f.content}`, () => (applied.content = "")),
        f.message && chip("message", `${m.value.commitMessage}: ${f.message}`, () => (applied.message = "")),
        (f.since || f.until) && chip("period", `${m.value.period}: ${f.since || "…"} – ${f.until || "…"}`, () => Object.assign(applied, { since: "", until: "" })),
      ];
    };

    // the filters' dialog, by its icon: the search on top, then the filters
    const filterMenu = () => (
      <VMenu modelValue={filterOpen.value} {...{ "onUpdate:modelValue": openFilters }} location="bottom start"
        closeOnContentClick={false} minWidth={360} maxWidth={420}>
        {{
          activator: ({ props: a }: { props: Record<string, unknown> }) => (
            <span class="gad-git__git-filter-btn">
              <VBtn {...a} size="x-small" variant={filtered.value ? "tonal" : "text"} color={filtered.value ? "primary" : undefined}
                density="comfortable" icon="mdi-filter-variant" title={m.value.filters} data-git-filter-open />
              {filtered.value && <span class="gad-git__git-filter-count" data-git-filter-count>{activeCount.value}</span>}
            </span>
          ),
          default: () => (
            <VCard data-git-filter-dialog>
              <VCardText class="pb-0">
                <div class="d-flex align-center mb-2">
                  <span class="text-subtitle-2">{m.value.filters}</span>
                  <VSpacer />
                  <HelpButton id="filters" title={m.value.filters} text={m.value.helpFilters} />
                </div>
                <VTextField modelValue={search.value} {...{ "onUpdate:modelValue": (v: string | null) => (search.value = v ?? "") }}
                  label={m.value.search} placeholder={m.value.searchHint} prependInnerIcon="mdi-magnify" clearable autofocus
                  density="compact" variant="outlined" hideDetails class="mb-3" data-git-filter-q />
                <VSelect modelValue={draft.authors} {...{ "onUpdate:modelValue": (v: string[]) => (draft.authors = v ?? []) }}
                  items={authorItems.value} label={m.value.authors} multiple chips closableChips clearable
                  density="compact" variant="outlined" hideDetails class="mb-3" data-git-filter-authors />
                {mode.value !== "file" && (
                  <VTextField modelValue={draft.name} {...{ "onUpdate:modelValue": (v: string | null) => (draft.name = v ?? "") }}
                    label={m.value.fileName} placeholder={m.value.fileNameHint} prependInnerIcon="mdi-file-search-outline" clearable
                    density="compact" variant="outlined" hideDetails class="mb-3" data-git-filter-name />
                )}
                <VTextField modelValue={draft.content} {...{ "onUpdate:modelValue": (v: string | null) => (draft.content = v ?? "") }}
                  label={m.value.content} placeholder={m.value.contentHint} prependInnerIcon="mdi-text-search" clearable
                  density="compact" variant="outlined" hideDetails class="mb-3" data-git-filter-content />
                <VTextField modelValue={draft.message} {...{ "onUpdate:modelValue": (v: string | null) => (draft.message = v ?? "") }}
                  label={m.value.commitMessage} prependInnerIcon="mdi-message-text-outline" clearable
                  density="compact" variant="outlined" hideDetails class="mb-3" data-git-filter-message />
                <div class="text-caption mb-1">{m.value.period}</div>
                <div class="d-flex ga-2 mb-1">
                  <VTextField modelValue={draft.since} {...{ "onUpdate:modelValue": (v: string | null) => (draft.since = v ?? "") }}
                    type="date" label={m.value.since} density="compact" variant="outlined" hideDetails data-git-filter-since />
                  <VTextField modelValue={draft.until} {...{ "onUpdate:modelValue": (v: string | null) => (draft.until = v ?? "") }}
                    type="date" label={m.value.until} density="compact" variant="outlined" hideDetails data-git-filter-until />
                </div>
                <div class="d-flex ga-1">
                  <VBtn size="x-small" variant="text" class="text-none" data-git-filter-last={7} onClick={() => lastDays(7)}>{m.value.last7}</VBtn>
                  <VBtn size="x-small" variant="text" class="text-none" data-git-filter-last={30} onClick={() => lastDays(30)}>{m.value.last30}</VBtn>
                  <VBtn size="x-small" variant="text" class="text-none" data-git-filter-last={365} onClick={() => lastDays(365)}>{m.value.lastYear}</VBtn>
                </div>
              </VCardText>
              <VCardActions>
                <VBtn size="small" variant="text" class="text-none" prependIcon="mdi-filter-remove-outline" data-git-filter-clear onClick={clearFilters}>
                  {m.value.clear}
                </VBtn>
                <VSpacer />
                <VBtn size="small" variant="tonal" color="primary" class="text-none" prependIcon="mdi-filter-check-outline" data-git-filter-apply onClick={applyFilters}>
                  {m.value.apply}
                </VBtn>
              </VCardActions>
            </VCard>
          ),
        }}
      </VMenu>
    );

    const logColumn = () => (
      <div class="gad-git__git-log" style={{ width: `${logW.size.value}px` }}>
        <div class="gad-git__git-head">
          <span>{mode.value === "file" ? m.value.fileHistory : m.value.log}</span>
          <span class="gad-git__git-spacer" />
          {filterMenu()}
          {mode.value === "file"
            ? <HelpButton id="file-history" title={m.value.fileHistory} text={m.value.helpFileHistory} />
            : <HelpButton id="log" title={m.value.log} text={m.value.helpLog} />}
        </div>
        {filtered.value && <div class="gad-git__git-chips" data-git-filter-chips>{filterChips()}</div>}
        {filtered.value && !commits.value.length && loading.value === 0 && (
          <div class="pa-3 text-medium-emphasis text-body-2" data-git-no-commits>{m.value.noCommits}</div>
        )}
        {commits.value.map((c, i) => (
          <div
            key={c.hash}
            class={["gad-git__git-commit", {
              "gad-git__git-commit--active": c.hash === selected.value,
              "gad-git__git-commit--second": c.hash === second.value,
            }]}
            title={`${c.hash.slice(0, 10)} — ${c.author}, ${shortDate(c.date)}${c.path ? ` — ${c.from ? `${c.from} → ` : ""}${c.path}` : ""}`}
            data-git-commit={c.hash}
            onClick={(e: MouseEvent) => select(c.hash, e)}
          >
            {mode.value === "log" && !filtered.value ? <Graph row={rows.value[i]} /> : <i class="mdi mdi-circle-small gad-git__git-dot" />}
            {(c.refs ?? []).map((r) => (
              <span class="gad-git__git-ref">{r}</span>
            ))}
            <span class="gad-git__git-ellipsis gad-git__git-subject">{c.subject}</span>
            {mode.value === "file" && c.from && <span class="gad-git__git-ref" title={`${c.from} → ${c.path}`}>R</span>}
            <span class="gad-git__git-meta">{c.author}</span>
            <span class="gad-git__git-meta">{shortDate(c.date)}</span>
          </div>
        ))}
        {more.value && (
          <VBtn size="small" variant="text" block data-git-more onClick={() => loadLog(true)}>
            {m.value.more}
          </VBtn>
        )}
      </div>
    );

    return () => (
      <div class="gad-git__git" data-git-panel>
        <div class="gad-git__git-bar">
          <span class="gad-git__git-title">{m.value.git}</span>
          <VBtnToggle modelValue={mode.value} {...{ "onUpdate:modelValue": (v: Mode | undefined) => v && (mode.value = v) }}
            density="compact" variant="outlined" divided mandatory class="gad-git__git-modes" data-git-modes>
            <VBtn value="log" size="x-small" prependIcon="mdi-source-commit" class="text-none" data-git-mode="log">{m.value.log}</VBtn>
            <VBtn value="file" size="x-small" prependIcon="mdi-file-clock-outline" class="text-none" data-git-mode="file">{m.value.fileHistory}</VBtn>
            {canCompare && <VBtn value="compare" size="x-small" prependIcon="mdi-compare-horizontal" class="text-none" data-git-mode="compare">{m.value.compare}</VBtn>}
          </VBtnToggle>
          {mode.value !== "compare" && (
            <label class="gad-git__git-field">
              <span>{m.value.branch}</span>
              {branchSelect(branch.value, (v) => (branch.value = v), { "data-git-branch-select": "", title: m.value.branch })}
            </label>
          )}
          {mode.value === "file" && (
            <label class="gad-git__git-field gad-git__git-field--grow">
              <span>{m.value.file}</span>
              <input class="gad-git__git-select gad-git__git-path" value={filePath.value} placeholder={m.value.chooseFile}
                onInput={(e: Event) => (filePath.value = (e.target as HTMLInputElement).value)} data-git-file-path />
              <VBtn size="x-small" variant="text" icon="mdi-file-arrow-left-right-outline" title={m.value.useOpenFile}
                disabled={!ctx.openPath.value} data-git-use-open onClick={() => (filePath.value = ctx.openPath.value)} />
            </label>
          )}
          {mode.value === "compare" && (
            <>
              <label class="gad-git__git-field">
                <span>{m.value.compareFrom}</span>
                {refInput(compareA.value, (v) => (compareA.value = v), { "data-git-compare-a": "" })}
              </label>
              <VBtn size="x-small" variant="text" icon="mdi-swap-horizontal" title={m.value.swap} data-git-swap
                disabled={compareB.value === WORK}
                onClick={() => ([compareA.value, compareB.value] = [compareB.value, compareA.value])} />
              <label class="gad-git__git-field">
                <span>{m.value.compareTo}</span>
                {refInput(compareB.value, (v) => (compareB.value = v), { "data-git-compare-b": "" }, true)}
              </label>
              <datalist id="gad-ide-git-refs">
                <option value={m.value.workingFiles} />
                {branches.value.map((b) => (
                  <option value={b.name}>{b.default ? m.value.defaultBranch : ""}</option>
                ))}
              </datalist>
            </>
          )}
          <VBtn size="x-small" variant="text" icon="mdi-refresh" title={m.value.refresh} data-git-refresh onClick={refresh} />
          {loading.value > 0 && <VProgressCircular indeterminate size={14} width={2} color="primary" />}
          {error.value && <span class="text-error text-body-2 ms-2 gad-git__git-ellipsis" data-git-error>{error.value}</span>}
          <span class="gad-git__git-spacer" />
          {slots.actions?.()}
        </div>
        {mode.value === "compare" ? (
          <div class="gad-git__git-cols">
            <div class="gad-git__git-detail" style={{ borderLeft: 0 }}>
              <span class="gad-git__help-corner"><HelpButton id="compare" title={m.value.compare} text={m.value.helpCompare} /></span>
              {view.value ? (
                <>
                  <div class="gad-git__git-compare-title" data-git-compare-title>{view.value.title}</div>
                  {diff(view.value)}
                </>
              ) : (
                <div class="pa-4 text-medium-emphasis">{m.value.chooseRefs}</div>
              )}
            </div>
          </div>
        ) : (
          <div class="gad-git__git-cols">
            <div class="gad-git__git-branches" style={{ width: `${branchesW.size.value}px` }}>
              <div class="gad-git__git-head">
                <span>{m.value.branches}</span>
                <HelpButton id="branches" title={m.value.branches} text={m.value.helpBranches} />
              </div>
              {local.value.map(branchItem)}
              {remote.value.length > 0 && <div class="gad-git__git-head">{m.value.remoteBranches}</div>}
              {remote.value.map(branchItem)}
            </div>
            <ResizeHandle onStart={branchesW.begin} onDrag={(dx: number) => branchesW.drag(dx)} onReset={branchesW.reset} />
            {logColumn()}
            <ResizeHandle onStart={logW.begin} onDrag={(dx: number) => logW.drag(dx)} onReset={logW.reset} />
            <div class="gad-git__git-detail">
              <span class="gad-git__help-corner"><HelpButton id="commit" title={m.value.help} text={m.value.helpCommit} /></span>
              {detail()}
            </div>
          </div>
        )}
      </div>
    );
  },
});
