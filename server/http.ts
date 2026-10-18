// gitHandler — the example backend's HTTP API: GitRepo's answers as JSON,
// at base + "git/…" (the routes of gad's `gad ide` server, web/ide/git.go):
//
//	GET  git/changes                  {"files": [summary]}
//	GET  git/diff?path                a change's diff ({path, from, old, new, binary}); 404 when it is no more one
//	POST git/save {path, content}     the file written (unless readonly)
//	GET  git/branches                 {"branches": [...], "default": name}
//	GET  git/log?ref&skip&limit[&path][&q&author…&name&content&message&since&until]
//	                                  {"commits": [...]}: of a file, its history; filtered
//	GET  git/authors?ref[&path]       {"authors": [{name, email, commits}]}
//	GET  git/blame?ref&path           {"lines": [...], "commits": {...}} (ref empty: the working file)
//	GET  git/commit?hash              the commit, its message and files
//	GET  git/commit/diff?hash&path&from  a file's diff in the commit
//	GET  git/compare?a&b              {"files": [...]}: from the ref a to b (b empty: the working files)
//	GET  git/compare/diff?a&b&path&from  a file's diff from a to b
//	GET  git/file?hash&path           the file as the commit has it (a download)
//	GET  git/patch?hash[&path]        the commit's patch (a download)
import { cleanPath, GitError, GitRepo } from "./git";

export interface GitHandlerOptions {
  /** where the API is: "/api/" serves "/api/git/…" */
  base?: string;
  /** no file is written (git/save refused) */
  readonly?: boolean;
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const fail = (status: number, error: string) => json({ error }, status);
const download = (name: string, type: string, b: Uint8Array) =>
  new Response(b, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name.replaceAll('"', "")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** gitHandler answers a request of the API, or undefined when it is none. */
export function gitHandler(repo: GitRepo, opts: GitHandlerOptions = {}) {
  const prefix = (opts.base ?? "/api/") + "git/";
  return async (req: Request): Promise<Response | undefined> => {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(prefix)) return undefined;
    const op = url.pathname.slice(prefix.length);
    const q = url.searchParams;
    const path = (name: string, optional = false) => {
      const v = q.get(name) ?? "";
      if (!v && optional) return "";
      return cleanPath(v);
    };
    try {
      if (op === "save") {
        if (req.method !== "POST") return fail(405, "method not allowed");
        if (opts.readonly) return fail(403, "read only");
        const body = (await req.json().catch(() => ({}))) as { path?: string; content?: string };
        repo.save(cleanPath(body.path ?? ""), String(body.content ?? ""));
        return json({ saved: true });
      }
      if (req.method !== "GET") return fail(405, "method not allowed");
      switch (op) {
        case "changes":
          return json({ files: await repo.changes() });
        case "diff": {
          const f = await repo.diff(path("path"));
          return f ? json(f) : fail(404, "this file is no longer changed");
        }
        case "branches": {
          const bs = await repo.branches();
          return json({ branches: bs, default: await repo.defaultBranch(bs) });
        }
        case "log": {
          const limit = Number(q.get("limit")) || 100;
          const commits = await repo.log(q.get("ref") || "HEAD", Math.max(Number(q.get("skip")) || 0, 0), limit > 0 && limit <= 1000 ? limit : 100,
            path("path", true), {
              q: q.get("q") ?? "", name: q.get("name") ?? "", content: q.get("content") ?? "", message: q.get("message") ?? "",
              since: q.get("since") ?? "", until: q.get("until") ?? "", authors: q.getAll("author"),
            });
          return json({ commits });
        }
        case "authors":
          return json({ authors: await repo.authors(q.get("ref") || "HEAD", path("path", true)) });
        case "blame":
          return json(await repo.blame(q.get("ref") ?? "", path("path")));
        case "commit":
          return json(await repo.commit(q.get("hash") ?? ""));
        case "commit/diff":
          return json(await repo.commitDiff(q.get("hash") ?? "", path("path"), path("from", true)));
        case "compare":
          return json({ files: await repo.compare(q.get("a") ?? "", q.get("b") ?? "") });
        case "compare/diff":
          return json(await repo.compareDiff(q.get("a") ?? "", q.get("b") ?? "", path("path"), path("from", true)));
        case "file": {
          const p = path("path");
          return download(base(p), "application/octet-stream", await repo.file(q.get("hash") ?? "", p));
        }
        case "patch": {
          const hash = q.get("hash") ?? "", p = path("path", true);
          const name = hash.slice(0, 10) + (p ? "-" + base(p) : "") + ".patch";
          return download(name, "text/x-patch; charset=utf-8", await repo.patch(hash, p));
        }
        default:
          return fail(404, "not found");
      }
    } catch (e) {
      if (e instanceof GitError) return fail(e.status, e.message);
      return fail(500, String((e as Error)?.message ?? e));
    }
  };
}
