// GitRepo — the example backend's repository: the working tree of a folder
// of a git repository (the workspace: its root, or a folder of it — only its
// files are shown), read by the git binary. The same answers as gad's
// `gad ide` server (web/ide/git.go): the files changed and their diffs, the
// branches and the default one, the log (filtered, of a file: its history),
// a commit and its files, two refs compared, the authors, a file's blame.
//
// Every value given to git goes as an argument of its own (never a shell);
// paths are checked to be of the workspace and out of .git, refs to be no
// option nor range.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";

/** GitFile is a file of a diff: its summary (path, origin of a renamed one,
 * status M, A, D, R, ?) and, asked for alone, its contents. */
export interface GitFile {
  path: string;
  from?: string;
  status?: string;
  old?: string;
  new?: string;
  binary?: boolean;
}

export interface GitBranch {
  name: string;
  hash: string;
  remote?: boolean;
  current?: boolean;
  subject?: string;
}

export interface GitCommit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
  refs?: string[];
  path?: string;
  from?: string;
}

export interface GitCommitDetail extends GitCommit {
  message: string;
  files: GitFile[];
}

export interface GitAuthor {
  name: string;
  email: string;
  commits: number;
}

export interface GitBlame {
  lines: { hash: string; content: string }[];
  commits: Record<string, { author: string; email: string; date: string; summary: string; path?: string }>;
  binary?: boolean;
}

/** LogFilter chooses the commits of a log (see GitRepo.log). */
export interface LogFilter {
  q?: string;
  authors?: string[];
  name?: string;
  content?: string;
  message?: string;
  since?: string;
  until?: string;
}

/** GitError is an error of the request (400), not of the repository (500). */
export class GitError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** MAX_DIFF is the largest content compared: a larger one is not (binary). */
const MAX_DIFF = 2 << 20;
const TIMEOUT_MS = 30_000;
const MAX_FILTER_TEXT = 200;
const MAX_AUTHORS = 50;
const HASH = /^[0-9a-fA-F]{4,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOG_FORMAT = "%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%D";
export const NOT_COMMITTED = "0".repeat(40);

/** validRef says whether ref may be given to git as a revision: no option,
 * no space nor control character, no range. */
export function validRef(ref: string): boolean {
  if (!ref || ref.startsWith("-") || ref.includes("..")) return false;
  for (const ch of ref) {
    const c = ch.codePointAt(0)!;
    if (c <= 32 || c === 0x7f || ch === ":") return false;
  }
  return true;
}

/** cleanPath is p as a path of the workspace: clean, in it, not in .git. */
export function cleanPath(p: string): string {
  const c = posix.normalize("/" + p.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (!c || c !== p.replace(/^\.\//, "") || c.split("/").includes(".git") || c.split("/").includes("..")) {
    throw new GitError("invalid path");
  }
  return c;
}

const decoder = new TextDecoder();

/** contentOf is b as text, or binary: a NUL byte, or too large. */
function contentOf(b: Uint8Array): { text: string; binary: boolean } {
  if (b.length > MAX_DIFF || b.subarray(0, 8000).includes(0)) return { text: "", binary: true };
  return { text: decoder.decode(b), binary: false };
}

/** quoteMeta escapes the characters of a regular expression (POSIX ERE). */
const quoteMeta = (s: string) => s.replace(/[\\.+*?()|[\]{}^$]/g, "\\$&");

/** parseNameStatus are the files of a diff's `--name-status -z`. */
export function parseNameStatus(out: string): GitFile[] {
  const files: GitFile[] = [];
  const parts = out.split("\x00");
  for (let i = 0; i < parts.length; i++) {
    const st = parts[i].replace(/^\n+/, "");
    if (!st || i + 1 >= parts.length) continue;
    const f: GitFile = { path: "", status: st[0] };
    if (f.status === "R" || f.status === "C") {
      if (i + 2 >= parts.length) break;
      f.from = parts[i + 1];
      f.path = parts[i + 2];
      f.status = "R";
      i += 2;
    } else {
      f.path = parts[i + 1];
      i++;
    }
    files.push(f);
  }
  return files;
}

function parseCommit(f: string[]): GitCommit {
  const c: GitCommit = {
    hash: f[0],
    parents: f[1].split(/\s+/).filter(Boolean),
    author: f[2],
    email: f[3],
    date: f[4],
    subject: f[5],
  };
  const refs = f[6].split(", ").map((r) => r.trim()).filter(Boolean);
  if (refs.length) c.refs = refs;
  return c;
}

/** similarity is how alike two texts are: their lines in common (Dice's). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.split("\n"), lb = b.split("\n");
  const count = new Map<string, number>();
  for (const l of la) count.set(l, (count.get(l) ?? 0) + 1);
  let common = 0;
  for (const l of lb) {
    const n = count.get(l) ?? 0;
    if (n > 0) {
      common++;
      count.set(l, n - 1);
    }
  }
  return (2 * common) / (la.length + lb.length);
}

/** the environment of git: none of its own variables, no prompt, no lock */
function gitEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_") && v !== undefined) env[k] = v;
  return { ...env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" };
}

export class GitRepo {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** git runs git in the workspace; its error carries what git said. */
  async git(...args: string[]): Promise<Uint8Array> {
    const p = Bun.spawn(["git", ...args], { cwd: this.root, env: gitEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    try {
      const [out, err, code] = await Promise.all([
        new Response(p.stdout).arrayBuffer(),
        new Response(p.stderr).text(),
        p.exited,
      ]);
      if (code !== 0) throw new Error(`git ${args[0]}: exit ${code}: ${err.trim()}`);
      return new Uint8Array(out);
    } finally {
      clearTimeout(timer);
    }
  }
  private async text(...args: string[]): Promise<string> {
    return decoder.decode(await this.git(...args));
  }

  /** isRepo says whether the workspace is in a git repository. */
  async isRepo(): Promise<boolean> {
    try {
      return (await this.text("rev-parse", "--is-inside-work-tree")).trim() === "true";
    } catch {
      return false;
    }
  }

  /** prefix is the workspace's folder in the repository ("" at its root). */
  async prefix(): Promise<string> {
    return (await this.text("rev-parse", "--show-prefix")).trim();
  }

  /** abs is the path p of the workspace on the disk. */
  private abs(p: string): string {
    const a = resolve(this.root, cleanPath(p));
    if (a !== this.root && !a.startsWith(this.root + sep)) throw new GitError("invalid path");
    return a;
  }

  /** show is the file p at rev: its text, or binary. */
  async show(rev: string, p: string): Promise<{ text: string; binary: boolean }> {
    return contentOf(await this.git("show", `${rev}:./${p}`));
  }
  private async showOrEmpty(rev: string, p: string) {
    try {
      return await this.show(rev, p);
    } catch {
      return { text: "", binary: false };
    }
  }
  private readWorking(p: string): { text: string; binary: boolean } | undefined {
    try {
      return contentOf(readFileSync(this.abs(p)));
    } catch {
      return undefined;
    }
  }

  /** changes are the files changed and not committed; a file deleted and one
   * new of a content alike paired as a rename. */
  async changes(): Promise<GitFile[]> {
    const prefix = await this.prefix();
    const out = await this.text("status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".");
    const strip = (p: string) => (p.startsWith(prefix) ? p.slice(prefix.length) : p);
    let files: GitFile[] = [];
    const parts = out.split("\x00");
    for (let i = 0; i < parts.length; i++) {
      const e = parts[i];
      if (e.length < 4) continue;
      const x = e[0], y = e[1];
      const f: GitFile = { path: strip(e.slice(3)) };
      if (x === "?") f.status = "?";
      else if (x === "R" || y === "R" || x === "C") {
        f.status = "R";
        if (i + 1 < parts.length) f.from = strip(parts[++i]);
      } else if (x === "D" || y === "D") f.status = "D";
      else if (x === "A" || y === "A") f.status = "A";
      else f.status = "M";
      files.push(f);
    }
    files = await this.pairRenames(files);
    return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  private async pairRenames(files: GitFile[]): Promise<GitFile[]> {
    const del = files.map((f, i) => (f.status === "D" ? i : -1)).filter((i) => i >= 0);
    const add = files.map((f, i) => (f.status === "?" || f.status === "A" ? i : -1)).filter((i) => i >= 0);
    if (!del.length || !add.length || del.length * add.length > 400) return files;
    const news = new Map<number, string>();
    for (const j of add) {
      const w = this.readWorking(files[j].path);
      if (w && !w.binary) news.set(j, w.text);
    }
    const gone = new Set<number>();
    for (const i of del) {
      let old: string;
      try {
        old = (await this.show("HEAD", files[i].path)).text;
      } catch {
        continue;
      }
      let best = -1, bestSim = 0.5;
      for (const j of add) {
        const text = news.get(j);
        if (text === undefined || gone.has(j)) continue;
        const sim = similarity(old, text);
        if (sim > bestSim || (sim === bestSim && best >= 0 && posix.basename(files[j].path) === posix.basename(files[i].path))) {
          best = j;
          bestSim = sim;
        }
      }
      if (best < 0) continue;
      gone.add(best);
      files[i] = { path: files[best].path, from: files[i].path, status: "R" };
    }
    return files.filter((_, j) => !gone.has(j));
  }

  /** diff is the change of the file p: HEAD's content (of from, a renamed
   * one's origin) and the current one; undefined when p is no change. */
  async diff(p: string): Promise<GitFile | undefined> {
    const f = (await this.changes()).find((x) => x.path === p);
    if (!f) return undefined;
    let oldBin = false, newBin = false;
    if (f.status !== "?" && f.status !== "A") {
      const o = await this.showOrEmpty("HEAD", f.from || f.path);
      f.old = o.text;
      oldBin = o.binary;
    }
    if (f.status !== "D") {
      const w = this.readWorking(f.path);
      if (w) {
        f.new = w.text;
        newBin = w.binary;
      }
    }
    if ((f.binary = oldBin || newBin)) {
      f.old = "";
      f.new = "";
    }
    return f;
  }

  /** save writes the file p with content, its line endings kept. */
  save(p: string, content: string): void {
    const a = this.abs(p);
    let was: Buffer | undefined;
    try {
      was = readFileSync(a);
    } catch {
      /* new */
    }
    if (!was || !was.includes("\r\n")) content = content.replaceAll("\r\n", "\n");
    mkdirSync(dirname(a), { recursive: true });
    writeFileSync(a, content);
  }

  /** branches are the branches, local and remote (a remote's HEAD aside). */
  async branches(): Promise<GitBranch[]> {
    const out = await this.text(
      "for-each-ref",
      "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(HEAD)%00%(contents:subject)",
      "refs/heads",
      "refs/remotes",
    );
    const bs: GitBranch[] = [];
    for (const line of out.trim().split("\n")) {
      const f = line.split("\x00");
      if (f.length < 5 || f[0].endsWith("/HEAD")) continue;
      bs.push({ name: f[1], hash: f[2], remote: f[0].startsWith("refs/remotes/") || undefined, current: f[3] === "*" || undefined, subject: f[4] });
    }
    return bs;
  }

  /** defaultBranch is the repository's default branch: origin's HEAD (the
   * local one of its name when there is one), init.defaultBranch, main or
   * master; else the current one. */
  async defaultBranch(bs: GitBranch[]): Promise<string> {
    const has = (n: string) => bs.some((b) => b.name === n);
    try {
      const r = (await this.text("symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD")).trim();
      if (r) {
        const local = r.replace(/^origin\//, "");
        if (has(local)) return local;
        if (has(r)) return r;
      }
    } catch {
      /* no remote HEAD */
    }
    try {
      const n = (await this.text("config", "--get", "init.defaultBranch")).trim();
      if (n && has(n)) return n;
    } catch {
      /* not set */
    }
    for (const n of ["main", "master"]) if (has(n)) return n;
    return bs.find((b) => b.current)?.name ?? bs[0]?.name ?? "HEAD";
  }

  /** filterArgs are git log's options of a filter: the message's texts
   * (--grep, all of them), the authors (any), a line added or taken out
   * (-G, the text quoted), a period — texts, case aside. */
  private filterArgs(f?: LogFilter): string[] {
    if (!f) return [];
    const texts = [f.q, f.name, f.content, f.message, ...(f.authors ?? [])].filter((t): t is string => !!t);
    for (const t of texts) if (t.length > MAX_FILTER_TEXT || /[\x00\n\r]/.test(t)) throw new GitError(`invalid filter "${t}"`);
    if ((f.authors?.length ?? 0) > MAX_AUTHORS) throw new GitError("too many authors");
    const args: string[] = [];
    const greps = [f.q, f.message].filter(Boolean) as string[];
    for (const g of greps) args.push("--grep=" + g);
    if (greps.length > 1) args.push("--all-match");
    for (const a of f.authors ?? []) if (a) args.push("--author=" + a);
    if (f.content) args.push("-G" + quoteMeta(f.content));
    for (const [v, opt, at] of [[f.since, "--since=", " 00:00:00"], [f.until, "--until=", " 23:59:59"]] as const) {
      if (!v) continue;
      if (!DATE.test(v)) throw new GitError(`invalid date "${v}"`);
      args.push(opt + v + at);
    }
    return args.length ? ["--regexp-ignore-case", "--fixed-strings", ...args] : [];
  }

  /** nameSpec is the files whose name has the filter's name: a glob, case aside. */
  private nameSpec(f?: LogFilter): string {
    if (!f?.name) return "";
    let n = f.name.replaceAll("\\", "/");
    if (!/[*?]/.test(n)) n = `*${n}*`;
    return ":(icase,glob)**/" + n.replace(/^\/+/, "");
  }

  /** log are limit commits of ref after skip, newest first: of the file p
   * (its history, renames followed, each commit with the file's path in it)
   * or of the workspace; filter chooses among them, a hash in its q first. */
  async log(ref: string, skip: number, limit: number, p = "", filter?: LogFilter): Promise<GitCommit[]> {
    if (!validRef(ref)) throw new GitError(`invalid ref "${ref}"`);
    if (p && filter?.name) throw new GitError("a file's history has no name filter");
    const fargs = this.filterArgs(filter);
    const commits = p ? await this.fileLog(ref, p, skip, limit, fargs) : await this.treeLog(ref, skip, limit, fargs, this.nameSpec(filter));
    if (skip > 0 || !filter?.q || !/^[0-9a-fA-F]{4,40}$/.test(filter.q)) return commits;
    // a hash: its commit first
    let hash: string;
    try {
      hash = (await this.text("rev-parse", "--verify", "-q", filter.q + "^{commit}")).trim();
      await this.git("merge-base", "--is-ancestor", hash, ref);
    } catch {
      return commits;
    }
    if (commits.some((c) => c.hash === hash)) return commits;
    const found = p ? await this.fileLog(hash, p, 0, 1, []) : await this.treeLog(hash, 0, 1, [], "");
    return found[0]?.hash === hash ? [found[0], ...commits] : commits;
  }

  private async treeLog(ref: string, skip: number, limit: number, fargs: string[], spec: string): Promise<GitCommit[]> {
    const prefix = await this.prefix();
    const args = ["log", "--topo-order", `--format=${LOG_FORMAT}%x1e`, `--skip=${skip}`, "-n", String(limit)];
    if (prefix) args.push("--parents");
    args.push(...fargs, ref, "--");
    if (spec) args.push(spec);
    else if (prefix) args.push(".");
    const out = await this.text(...args);
    return out
      .split("\x1e")
      .map((r) => r.replace(/^\n+/, "").split("\x00"))
      .filter((f) => f.length >= 7)
      .map(parseCommit);
  }

  private async fileLog(ref: string, p: string, skip: number, limit: number, fargs: string[]): Promise<GitCommit[]> {
    const out = await this.text(
      "log", "--follow", "-M", "--relative", "--name-status", "-z",
      `--format=%x1e${LOG_FORMAT}%x00`, `--skip=${skip}`, "-n", String(limit), ...fargs, ref, "--", p,
    );
    const commits: GitCommit[] = [];
    for (const rec of out.split("\x1e")) {
      const f = rec.split("\x00");
      if (f.length < 8) continue;
      const c = parseCommit(f.slice(0, 7));
      const files = parseNameStatus(f.slice(7).join("\x00"));
      c.path = files[0]?.path ?? p;
      if (files[0]?.from) c.from = files[0].from;
      commits.push(c);
    }
    return commits;
  }

  /** commit is the commit hash: its full message and the files it changed
   * from its first parent (all, of a root commit) — of the workspace. */
  async commit(hash: string): Promise<GitCommitDetail> {
    if (!HASH.test(hash)) throw new GitError(`invalid commit "${hash}"`);
    const f = (await this.text("show", "-s", `--format=${LOG_FORMAT}%x00%B`, hash)).split("\x00");
    if (f.length < 8) throw new Error(`commit ${hash}: unexpected output`);
    const c = parseCommit(f.slice(0, 7));
    const args = ["diff-tree", "-r", "-z", "-M", "--name-status", "--relative", "--no-commit-id"];
    args.push(...(c.parents.length ? [c.parents[0], c.hash] : ["--root", c.hash]));
    return { ...c, message: f.slice(7).join("\x00").replace(/\n+$/, ""), files: parseNameStatus(await this.text(...args)) };
  }

  private async firstParent(hash: string): Promise<string> {
    if (!HASH.test(hash)) throw new GitError(`invalid commit "${hash}"`);
    return (await this.text("rev-list", "--parents", "-n", "1", hash)).trim().split(/\s+/)[1] ?? "";
  }

  /** commitDiff is the diff of the file p in the commit hash. */
  async commitDiff(hash: string, p: string, from = ""): Promise<GitFile> {
    const parent = await this.firstParent(hash);
    const f: GitFile = { path: p, from: from || undefined };
    const o = parent ? await this.showOrEmpty(parent, from || p) : { text: "", binary: false };
    const n = await this.showOrEmpty(hash, p);
    f.old = o.text;
    f.new = n.text;
    if ((f.binary = o.binary || n.binary)) f.old = f.new = "";
    return f;
  }

  /** compare are the files of the workspace changed from the ref a to the
   * ref b (b empty: to the working files). */
  async compare(a: string, b: string): Promise<GitFile[]> {
    if (!validRef(a) || (b && !validRef(b))) throw new GitError(`invalid ref "${a}" / "${b}"`);
    const args = ["diff", "-M", "--relative", "--name-status", "-z", a];
    if (b) args.push(b);
    return parseNameStatus(await this.text(...args, "--", "."));
  }

  /** compareDiff is the diff of the file p from a (where it was from) to b. */
  async compareDiff(a: string, b: string, p: string, from = ""): Promise<GitFile> {
    if (!validRef(a) || (b && !validRef(b))) throw new GitError(`invalid ref "${a}" / "${b}"`);
    const f: GitFile = { path: p, from: from || undefined };
    const o = await this.showOrEmpty(a, from || p);
    const n = b ? await this.showOrEmpty(b, p) : this.readWorking(p) ?? { text: "", binary: false };
    f.old = o.text;
    f.new = n.text;
    if ((f.binary = o.binary || n.binary)) f.old = f.new = "";
    return f;
  }

  /** authors are the authors of ref's commits (of the file p's), the most
   * commits first. */
  async authors(ref: string, p = ""): Promise<GitAuthor[]> {
    if (!validRef(ref)) throw new GitError(`invalid ref "${ref}"`);
    const out = await this.text("shortlog", "-sne", ref, "--", p || ".");
    const as: GitAuthor[] = [];
    for (const line of out.split("\n")) {
      const m = /^\s*(\d+)\t(.*?)(?: <([^>]*)>)?$/.exec(line);
      if (m) as.push({ name: m[2], email: m[3] ?? "", commits: Number(m[1]) });
    }
    return as;
  }

  /** blame is who changed each line of the file p last, as ref has it (ref
   * empty: the working file, its lines not committed of the hash 0…0). */
  async blame(ref: string, p: string): Promise<GitBlame> {
    if (ref && !validRef(ref)) throw new GitError(`invalid ref "${ref}"`);
    const out = await this.git("blame", "--porcelain", "-M", ...(ref ? [ref] : []), "--", p);
    const b: GitBlame = { lines: [], commits: {} };
    if (out.length > 4 * MAX_DIFF) return { ...b, binary: true };
    let cur = "";
    let info = { author: "", email: "", date: "", summary: "" } as GitBlame["commits"][string];
    for (const line of decoder.decode(out).split("\n")) {
      if (line.startsWith("\t")) {
        if (line.includes("\x00")) return { lines: [], commits: {}, binary: true };
        b.lines.push({ hash: cur, content: line.slice(1) });
        if (!b.commits[cur]) b.commits[cur] = info;
      } else if (line.length >= 40 && HASH.test(line.slice(0, 40)) && (line.length === 40 || line[40] === " ")) {
        const h = line.slice(0, 40);
        if (h !== cur) info = b.commits[h] ?? { author: "", email: "", date: "", summary: "" };
        cur = h;
      } else {
        const i = line.indexOf(" ");
        const k = i < 0 ? line : line.slice(0, i), v = i < 0 ? "" : line.slice(i + 1);
        if (k === "author") info.author = v;
        else if (k === "author-mail") info.email = v.replace(/^<|>$/g, "");
        else if (k === "author-time") info.date = new Date(Number(v) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
        else if (k === "summary") info.summary = v;
        else if (k === "filename") info.path = v;
      }
    }
    return b;
  }

  /** file is the file p as the commit hash has it (bytes). */
  async file(hash: string, p: string): Promise<Uint8Array> {
    if (!HASH.test(hash)) throw new GitError("invalid hash");
    return this.git("show", `${hash}:./${p}`);
  }

  /** patch is the commit's patch, of the file p or whole. */
  async patch(hash: string, p = ""): Promise<Uint8Array> {
    if (!HASH.test(hash)) throw new GitError("invalid hash");
    const root = (await this.firstParent(hash)) === "" ? ["--root"] : [];
    return this.git("format-patch", ...root, "-1", "--stdout", "--relative", hash, "--", p || ".");
  }

  /** exists says whether the workspace folder exists. */
  exists(): boolean {
    return existsSync(join(this.root));
  }
}
