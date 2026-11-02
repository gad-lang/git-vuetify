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
});
