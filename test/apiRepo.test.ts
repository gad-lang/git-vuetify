import { afterEach, describe, expect, test } from "bun:test";
import { createHttpGitApi } from "../src/api";

// A repository of the workspace (repo): every route asks for it.
describe("createHttpGitApi with a repository", () => {
  const urls: string[] = [];
  const real = globalThis.fetch;
  afterEach(() => { globalThis.fetch = real; urls.length = 0; });
  test("repo in every URL", async () => {
    globalThis.fetch = (async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify({ files: [], branches: [], commits: [] }), { status: 200 });
    }) as typeof fetch;
    const api = createHttpGitApi("api/ide/", "b/c");
    await api.changes();
    await api.diff("f.txt");
    await api.branches();
    await api.log!("main", 0, 10);
    expect(urls[0]).toBe("api/ide/git/changes?repo=b%2Fc");
    expect(urls[1]).toBe("api/ide/git/diff?repo=b%2Fc&path=f.txt");
    expect(urls[2]).toBe("api/ide/git/branches?repo=b%2Fc");
    expect(urls[3]).toContain("git/log?repo=b%2Fc&ref=main");
    expect(api.fileUrl!("abc", "f.txt")).toBe("api/ide/git/file?repo=b%2Fc&hash=abc&path=f.txt");
    // none: as before
    globalThis.fetch = (async (u: string) => { urls.push(String(u)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    await createHttpGitApi("api/ide/").changes();
    expect(urls[urls.length - 1]).toBe("api/ide/git/changes");
  });
  test("commitNew posts the message and the paths", async () => {
    let got: { url: string; method?: string; body?: string } | undefined;
    globalThis.fetch = (async (u: string, init?: RequestInit) => {
      got = { url: String(u), method: init?.method, body: String(init?.body) };
      return new Response(JSON.stringify({ hash: "abc1234", subject: "m" }), { status: 200 });
    }) as typeof fetch;
    const c = await createHttpGitApi("api/ide/", "b").commitNew!("m", ["x.gad", "y.gad"]);
    expect(c).toEqual({ hash: "abc1234", subject: "m" });
    expect(got).toEqual({ url: "api/ide/git/commit/new?repo=b", method: "POST", body: JSON.stringify({ message: "m", paths: ["x.gad", "y.gad"] }) });
  });
  test("root: the workspace's folder in the repository", async () => {
    globalThis.fetch = (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify({ root: "src" }), { status: 200 }); }) as typeof fetch;
    expect(await createHttpGitApi("api/ide/").root!()).toBe("src");
    expect(urls[urls.length - 1]).toBe("api/ide/git/root");
  });
  test("stashes: the routes", async () => {
    const got: { url: string; method?: string; body?: string }[] = [];
    globalThis.fetch = (async (u: string, init?: RequestInit) => {
      got.push({ url: String(u), method: init?.method, body: init?.body ? String(init.body) : undefined });
      return new Response(JSON.stringify({ stashes: [{ ref: "stash@{0}" }], ref: "stash@{0}" }), { status: 200 });
    }) as typeof fetch;
    const api = createHttpGitApi("api/ide/", "r");
    expect((await api.stashes!())[0].ref).toBe("stash@{0}");
    await api.stashDiff!("abc", "a.gad", undefined, true);
    await api.stashNew!({ message: "m", untracked: true });
    await api.stashApply!("stash@{1}", true, false);
    await api.stashBranch!("stash@{0}", "b");
    await api.stashDrop!("stash@{0}");
    await api.stashClear!();
    expect(got.map((g) => `${g.method} ${g.url} ${g.body ?? ""}`)).toEqual([
      "GET api/ide/git/stashes?repo=r ",
      "GET api/ide/git/stash/diff?repo=r&hash=abc&path=a.gad&untracked=1 ",
      'POST api/ide/git/stash/new?repo=r {"message":"m","untracked":true}',
      'POST api/ide/git/stash/apply?repo=r {"ref":"stash@{1}","pop":true,"index":false}',
      'POST api/ide/git/stash/branch?repo=r {"ref":"stash@{0}","branch":"b"}',
      'POST api/ide/git/stash/drop?repo=r {"ref":"stash@{0}"}',
      "POST api/ide/git/stash/clear?repo=r {}",
    ]);
  });
});
