// The example backend: a git repository's API (http.ts) over HTTP, for the
// demo (demo/) — or any app of the components — to drive.
//
//	bun run server/main.ts [--root <dir>] [--port 8787] [--host 127.0.0.1] [--base /api/] [--readonly]
//
// root is the workspace: a git repository, or a folder of one (the current
// one by default). It listens on localhost only unless --host says else: it
// writes the files of the workspace (the Changes panel's save) unless
// --readonly.
import { GitRepo } from "./git";
import { gitHandler } from "./http";

function arg(name: string, def = ""): string {
  const i = Bun.argv.indexOf("--" + name);
  return i >= 0 && i + 1 < Bun.argv.length ? Bun.argv[i + 1] : def;
}
const flag = (name: string) => Bun.argv.includes("--" + name);

const repo = new GitRepo(arg("root", process.cwd()));
if (!(await repo.isRepo())) {
  console.error(`git-vuetify server: ${repo.root} is not in a git repository`);
  process.exit(1);
}
const base = arg("base", "/api/");
const handle = gitHandler(repo, { base, readonly: flag("readonly") });
const server = Bun.serve({
  hostname: arg("host", "127.0.0.1"),
  port: Number(arg("port", "8787")),
  async fetch(req) {
    return (await handle(req)) ?? new Response("not found", { status: 404 });
  },
});
console.log(`git-vuetify server: ${repo.root} at http://${server.hostname}:${server.port}${base}git/${flag("readonly") ? " (read only)" : ""}`);
