// The example backend (server/): its answers on a repository made here — as
// gad's web/ide git_test.go asks its server.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GitRepo, NOT_COMMITTED, type GitCommit } from "../server/git";
import { gitHandler } from "../server/http";

let repo: string;
let handle: (req: Request) => Promise<Response | undefined>;

const env = (name: string, email: string, date?: string) => ({
  ...process.env,
  GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email,
  ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
});
function git(args: string[], e: Record<string, string | undefined> = env("Ann", "ann@example.com")) {
  const p = Bun.spawnSync(["git", ...args], { cwd: repo, env: e });
  if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString()}`);
  return p.stdout.toString();
}
function write(p: string, s: string) {
  const a = join(repo, p);
  mkdirSync(dirname(a), { recursive: true });
  writeFileSync(a, s);
}
async function get<T = any>(path: string, status = 200): Promise<T> {
  const r = (await handle(new Request("http://x/api/git/" + path)))!;
  expect(r.status).toBe(status);
  return (await r.json()) as T;
}
const subjects = (cs: GitCommit[]) => cs.map((c) => c.subject).join(",");

// a repository whose workspace is its folder src: on main, first and second
// (Ann); a branch feature at first; then Bob's two, dated
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "git-vuetify-"));
  git(["init", "-q", "-b", "main"]);
  write("src/a.gad", "x := 1\ny := 2\nz := 3\nreturn x\n");
  write("src/old.gad", "one\ntwo\nthree\nfour\n");
  write("README", "out of the workspace\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "first"]);
  git(["branch", "feature"]);
  write("src/a.gad", "x := 10\ny := 2\nz := 3\nreturn x\n");
  write("README", "changed\n");
  git(["commit", "-q", "-am", "second\n\nThe body of the message."]);
  write("src/old.gad", "one\ntwo\nthree\nfour\nneedle here\n");
  git(["commit", "-q", "-am", "Fix the Parser\n\nIt broke on tabs."], env("Bob", "bob@example.com", "2020-01-10T10:00:00Z"));
  write("src/a.gad", "x := 10\ny := 20\nz := 3\nreturn x\n");
  git(["commit", "-q", "-am", "tune a"], env("Bob", "bob@example.com", "2020-03-01T10:00:00Z"));
  handle = gitHandler(new GitRepo(join(repo, "src")));
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("example backend", () => {
  test("branches: the default one", async () => {
    const r = await get("branches");
    expect(r.branches.map((b: any) => b.name)).toEqual(["feature", "main"]);
    expect(r.default).toBe("main");
  });

  test("log, commit, its diff, downloads", async () => {
    const cs = (await get("log?ref=main")).commits as GitCommit[];
    expect(subjects(cs)).toBe("tune a,Fix the Parser,second,first");
    expect(subjects((await get("log?ref=main&skip=3&limit=5")).commits)).toBe("first");
    const d = await get(`commit?hash=${cs[2].hash}`);
    expect(d.message).toBe("second\n\nThe body of the message.");
    expect(d.files).toEqual([{ path: "a.gad", status: "M" }]); // README is not the workspace's
    const f = await get(`commit/diff?hash=${cs[2].hash}&path=a.gad`);
    expect(f.old.startsWith("x := 1\n")).toBe(true);
    expect(f.new.startsWith("x := 10\n")).toBe(true);
    const file = (await handle(new Request(`http://x/api/git/file?hash=${cs[3].hash}&path=a.gad`)))!;
    expect(await file.text()).toBe("x := 1\ny := 2\nz := 3\nreturn x\n");
    const patch = await (await handle(new Request(`http://x/api/git/patch?hash=${cs[2].hash}&path=a.gad`)))!.text();
    expect(patch).toContain("-x := 1\n+x := 10");
    expect(patch).not.toContain("README");
    await get(`file?hash=${cs[0].hash}&path=../README`, 400);
    await get("log?ref=--output=/tmp/x", 400);
  });

  test("filters", async () => {
    const all = (await get("log?ref=main")).commits as GitCommit[];
    for (const [query, want] of [
      ["author=Bob+%3Cbob%40example.com%3E", "tune a,Fix the Parser"],
      ["author=bob&author=ann", "tune a,Fix the Parser,second,first"],
      ["q=parser", "Fix the Parser"],
      ["message=BROKE+ON", "Fix the Parser"],
      ["q=fix&message=tabs", "Fix the Parser"],
      ["q=fix&message=nothing", ""],
      ["name=OLD", "Fix the Parser,first"],
      ["name=*.gad&author=Ann", "second,first"],
      ["content=needle", "Fix the Parser"],
      ["content=y+%3A%3D+20", "tune a"],
      ["since=2020-01-01&until=2020-02-01", "Fix the Parser"],
      ["author=Bob&since=2020-02-01", "tune a"],
      [`q=${all[3].hash.slice(0, 8)}`, "first"],
      ["path=a.gad&author=Bob", "tune a"],
    ]) expect([query, subjects((await get(`log?ref=main&${query}`)).commits)]).toEqual([query, want]);
    for (const query of ["since=yesterday", "path=a.gad&name=x", "q=a%0Ab"]) await get(`log?ref=main&${query}`, 400);
  });

  test("authors and blame", async () => {
    const as = (await get("authors?ref=main")).authors;
    expect(as.map((a: any) => [a.name, a.commits])).toEqual([["Ann", 2], ["Bob", 2]]);
    const b = await get("blame?ref=main&path=a.gad");
    expect(b.lines.map((l: any) => l.content)).toEqual(["x := 10", "y := 20", "z := 3", "return x"]);
    expect(b.commits[b.lines[1].hash].author).toBe("Bob");
    expect(b.commits[b.lines[1].hash].date.startsWith("2020-03-01")).toBe(true);
    expect(b.commits[b.lines[0].hash].summary).toBe("second");
    expect(b.commits[b.lines[2].hash].summary).toBe("first");
  });

  test("a file's history, renamed; compares", async () => {
    git(["mv", "src/a.gad", "src/b.gad"]);
    git(["commit", "-q", "-m", "rename"]);
    write("src/b.gad", "x := 10\ny := 20\nz := 3\nreturn y\n");
    git(["commit", "-q", "-am", "third"]);
    const cs = (await get("log?ref=main&path=b.gad")).commits as GitCommit[];
    expect(cs.map((c) => [c.subject, c.path, c.from ?? ""])).toEqual([
      ["third", "b.gad", ""],
      ["rename", "b.gad", "a.gad"],
      ["tune a", "a.gad", ""],
      ["second", "a.gad", ""],
      ["first", "a.gad", ""],
    ]);
    const files = (await get(`compare?a=${cs[2].hash}&b=${cs[1].hash}`)).files;
    expect(files).toEqual([{ path: "b.gad", from: "a.gad", status: "R" }]);
    const f = await get(`compare/diff?a=feature&b=main&path=b.gad&from=a.gad`);
    expect(f.old.startsWith("x := 1\n")).toBe(true);
    expect(f.new.endsWith("return y\n")).toBe(true);
    write("src/b.gad", "working\n");
    const w = await get("compare/diff?a=main&path=b.gad");
    expect(w.new).toBe("working\n");
    const wb = await get("blame?path=b.gad");
    expect(wb.lines).toEqual([{ hash: NOT_COMMITTED, content: "working" }]);
    git(["checkout", "-q", "--", "src/b.gad"]);
  });

  test("changes: a rename paired, a save", async () => {
    // the IDE renames on the disk: git sees one deleted, one new
    const text = readFileSync(join(repo, "src/old.gad"), "utf8");
    rmSync(join(repo, "src/old.gad"));
    write("src/new.gad", text + "five\n");
    write("src/b.gad", "x := 10\r\ny := 20\r\n");
    git(["add", "src/b.gad"]);
    git(["commit", "-q", "-m", "crlf"]);
    write("src/b.gad", "x := 11\r\ny := 20\r\n");
    const files = (await get("changes")).files;
    expect(files).toEqual([
      { path: "b.gad", status: "M" },
      { path: "new.gad", from: "old.gad", status: "R" },
    ]);
    const d = await get("diff?path=new.gad");
    expect(d.old).toBe(text);
    expect(d.new).toBe(text + "five\n");
    await get("diff?path=a.gad", 404);
    // a save keeps the file's CRLF
    const r = (await handle(new Request("http://x/api/git/save", { method: "POST", body: JSON.stringify({ path: "b.gad", content: "x := 12\r\ny := 20\r\n" }) })))!;
    expect(r.status).toBe(200);
    expect(readFileSync(join(repo, "src/b.gad"), "utf8")).toBe("x := 12\r\ny := 20\r\n");
    const ro = gitHandler(new GitRepo(join(repo, "src")), { readonly: true });
    expect((await ro(new Request("http://x/api/git/save", { method: "POST", body: "{}" })))!.status).toBe(403);
    const bad = (await handle(new Request("http://x/api/git/save", { method: "POST", body: JSON.stringify({ path: ".git/config", content: "x" }) })))!;
    expect(bad.status).toBe(400);
  });
});
