// GitApi — the backend contract the Changes and Git panels drive: plain types
// and fetch, framework-agnostic. createHttpGitApi is its HTTP client: the API
// of gad's `gad ide` server (base "api/ide/"), of rvq's gitedit, and of the
// example backend of this package (server/).
import type { DiffFile } from "./diff/diffBrowserContext";

/** GitBranch is a branch of the repository. */
export interface GitBranch {
  /** "main", "origin/main" */
  name: string;
  /** the commit it points at */
  hash: string;
  /** a remote's */
  remote?: boolean;
  /** the one checked out */
  current?: boolean;
  /** its commit's subject */
  subject?: string;
  /** the repository's default branch (its remote's, else main/master) */
  default?: boolean;
}

/** GitCommit is a commit of a branch's log. */
export interface GitCommit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  /** ISO 8601 */
  date: string;
  subject: string;
  /** the branches and tags at it ("HEAD -> main", "tag: v1") */
  refs?: string[];
  /** in a file's history: the file's path in the commit, and the one it had
   * before when the commit renamed it */
  path?: string;
  from?: string;
}

/** GitLogFilter chooses the commits of a log (each empty: none out): q, in
 * the message or the start of the hash; authors ("Name <email>", any of
 * them); name, of a file changed (a log of the whole workspace only);
 * content, of a line added or taken out; message, in it; since and until,
 * dates (YYYY-MM-DD). Case aside, the texts as they are. */
export interface GitLogFilter {
  q?: string;
  authors?: string[];
  name?: string;
  content?: string;
  message?: string;
  since?: string;
  until?: string;
}

/** GitAuthor is an author of commits: how many. */
export interface GitAuthor {
  name: string;
  email: string;
  commits: number;
}

/** GitBlame is who changed each line of a file last: the lines (the hash
 * of the commit, all zeros for one not committed) and their commits. */
export interface GitBlame {
  lines: { hash: string; content: string }[];
  commits: Record<string, { author: string; email: string; date: string; summary: string; path?: string }>;
  binary?: boolean;
}

/** GitCommitDetail is a commit with its full message and the files it
 * changed (from its first parent: the commit before). */
export interface GitCommitDetail extends GitCommit {
  message: string;
  files: DiffFile[];
}

/** GitApi is what the Changes and Git panels ask of a repository (its
 * working tree, or a folder of it: the workspace). Paths are the workspace's. */
export interface GitApi {
  /** the files changed (not committed): their summary */
  changes: () => Promise<DiffFile[]>;
  /** the diff of a file changed: its old (HEAD's) and current contents */
  diff: (path: string, from?: string) => Promise<DiffFile>;
  /** writes the file changed with content (edited in the compare) */
  save: (path: string, content: string) => Promise<void>;
  branches: () => Promise<GitBranch[]>;
  /** the commits of ref, newest first: limit of them after skip — of a file
   * (path), its history, renames followed */
  log: (ref: string, skip?: number, limit?: number, path?: string, filter?: GitLogFilter) => Promise<GitCommit[]>;
  /** the authors of ref's commits (of a file's, path) */
  authors?: (ref: string, path?: string) => Promise<GitAuthor[]>;
  /** who changed each line of the file last, as ref has it (ref empty: the
   * working file) */
  blame?: (ref: string, path: string) => Promise<GitBlame>;
  commit: (hash: string) => Promise<GitCommitDetail>;
  /** the diff of a file the commit changed, with the commit before */
  commitDiff: (hash: string, path: string, from?: string) => Promise<DiffFile>;
  /** the files changed from the ref a to the ref b (branches, commits; b
   * empty: the working files) */
  compare?: (a: string, b: string) => Promise<DiffFile[]>;
  /** the diff of a file from a (where it was from, renamed) to b */
  compareDiff?: (a: string, b: string, path: string, from?: string) => Promise<DiffFile>;
  /** the URL that downloads the file as the commit has it */
  fileUrl?: (hash: string, path: string) => string;
  /** the URL that downloads the commit's patch (from the commit before): of
   * the file at path, or the whole commit's */
  patchUrl?: (hash: string, path?: string) => string;
}

async function jsonFetch<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || r.statusText);
  return data as T;
}

/**
 * createHttpGitApi is the HTTP client of a server whose git API is at
 * base + "git/…": "api/ide/" for a `gad ide` server, "/api/" for the example
 * backend (server/). "" — the default — is relative to the page.
 */
export function createHttpGitApi(base = ""): GitApi {
  const u = (p: string) => base + p;
  const q = (params: Record<string, string | number | undefined>) =>
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => k + "=" + encodeURIComponent(String(v)))
      .join("&");
  return {
    changes: () => jsonFetch<{ files: DiffFile[] }>("GET", u("git/changes")).then((r) => r.files || []),
    diff: (path, from) => jsonFetch<DiffFile>("GET", u("git/diff?") + q({ path, from })),
    save: (path, content) => jsonFetch<unknown>("POST", u("git/save"), { path, content }).then(() => undefined),
    branches: () =>
      jsonFetch<{ branches: GitBranch[]; default?: string }>("GET", u("git/branches")).then((r) =>
        (r.branches || []).map((b) => (b.name === r.default ? { ...b, default: true } : b)),
      ),
    log: (ref, skip, limit, path, filter) => {
      const f = filter ?? {};
      const authors = (f.authors ?? []).filter(Boolean).map((a) => "&author=" + encodeURIComponent(a)).join("");
      const query = q({ ref, skip, limit, path, q: f.q, name: f.name, content: f.content, message: f.message, since: f.since, until: f.until });
      return jsonFetch<{ commits: GitCommit[] }>("GET", u("git/log?") + query + authors).then((r) => r.commits || []);
    },
    authors: (ref, path) => jsonFetch<{ authors: GitAuthor[] }>("GET", u("git/authors?") + q({ ref, path })).then((r) => r.authors || []),
    blame: (ref, path) => jsonFetch<GitBlame>("GET", u("git/blame?") + q({ ref, path })),
    commit: (hash) => jsonFetch<GitCommitDetail>("GET", u("git/commit?") + q({ hash })),
    commitDiff: (hash, path, from) => jsonFetch<DiffFile>("GET", u("git/commit/diff?") + q({ hash, path, from })),
    compare: (a, b) => jsonFetch<{ files: DiffFile[] }>("GET", u("git/compare?") + q({ a, b })).then((r) => r.files || []),
    compareDiff: (a, b, path, from) => jsonFetch<DiffFile>("GET", u("git/compare/diff?") + q({ a, b, path, from })),
    fileUrl: (hash, path) => u("git/file?") + q({ hash, path }),
    patchUrl: (hash, path) => u("git/patch?") + q({ hash, path }),
  };
}
