# @gad-lang/git-vuetify

Reusable **Vuetify 3** components for a git repository — the Git and Changes
panels of the [Gad](https://github.com/gad-lang/gad) IDE
([`@gad-lang/ide-vuetify`](https://github.com/gad-lang/ide-vuetify)), on their
own:

- **`<GitPanel>`** — the repository, browsed (read only):
  - **Log**: the commits of a branch as a graph; a commit's message and the
    files it changed, each compared with the commit before (downloads of the
    file and of the patch); **Ctrl+click** on another commit compares the two.
  - **File history**: the commits that changed a file, renames followed;
    Ctrl+click compares the file in two commits; *compare with* another
    branch's or the working one.
  - **Compare**: what changed from a ref to another — branches, commits (their
    hashes, `main~5`) or the working files.
  - **Filters** (Log and File history): a search (the message, or a hash),
    authors, a file's name (`*.gadx`), content (a line added or taken out),
    the commit message, a period.
  - **Blame** of a file (IntelliJ's annotate): who changed each line last —
    a click on it shows the commit.
  - The branch navigated is chosen; the repository's **default branch** first.
  - A **?** in each part says what it does and how to use it.
- **`<ChangesPanel>`** — the files changed and not committed, each compared
  with HEAD's, the current side edited (a change taken back, undone, redone,
  saved); a file deleted and one new of a content alike, a rename.
- **`<DiffBrowser>` / `<DiffMergeView>`** — the diff browser: the tree of the
  files, each opened in a tab, the two sides scrolled together, the changes
  one by one (F7 / Shift+F7) — CodeMirror's merge view.
- **`ResizeHandle` / `useStoredSize`** — the edges the panes are resized by,
  their sizes kept.

The texts are in English (`DEFAULT_GIT_MESSAGES`) and Brazilian Portuguese
(`GIT_MESSAGES_PT_BR`); any of them can be given.

The components are **backend-agnostic**: they drive a `GitApi`.
`createHttpGitApi(base)` is the client of its HTTP API, which three servers
answer:

- gad's `gad ide` server (`web/ide/git.go`; base `"api/ide/"`),
- rvq's gitedit (the admin's editor of a git repository's files),
- the **example backend** of this repository (`server/`, TypeScript on Bun).

> **Status:** not yet published to npm.

## Install

```sh
bun add @gad-lang/git-vuetify vue vuetify dockview-vue
# optional, for gad's languages in the compare: @gad-lang/codemirror-gad
```

## Usage

```tsx
import { ChangesPanel, createHttpGitApi, GIT_MESSAGES_PT_BR, GitPanel } from "@gad-lang/git-vuetify";
import "@gad-lang/git-vuetify/style.css";
import "dockview-core/dist/styles/dockview.css";

const api = createHttpGitApi("/api/");

<GitPanel api={api} dark={false} openPath="src/main.ts" messages={GIT_MESSAGES_PT_BR}>
  {{ actions: () => <MyExpandButton /> }}
</GitPanel>

<ChangesPanel api={api} readonly={false} writes={writes} onSaved={(path) => reload(path)} />
```

| `GitPanel` prop | |
|---|---|
| `api` | the `GitApi` |
| `dark` | the editors' theme |
| `openPath` | the file open beside: the file history follows it until another is typed |
| `messages` | the texts (`Partial<GitMessages>`), over the English ones |
| slot `actions` | at the end of the bar |

| `ChangesPanel` prop | |
|---|---|
| `api`, `dark`, `messages` | as above |
| `readonly` | nothing is saved |
| `writes` | a counter: its change looks at the changes again (a file written beside) |
| event `saved(path)` | a file saved from the compare |

## The example backend and the demo

```sh
bun install
bun run server -- --root /path/to/a/repo      # http://127.0.0.1:8787/api/git/…
bun run dev                                    # the demo (Vite), its /api proxied to the server
```

`server/main.ts` options: `--root` (a repository, or a folder of one: only its
files are shown; the current folder by default), `--port` (8787), `--host`
(`127.0.0.1` — it writes the files of the workspace, from the Changes panel,
unless `--readonly`), `--base` (`/api/`).

In your own server, `gitHandler(new GitRepo(root), { base, readonly })` (from
`server/http.ts`) answers the API's requests (`Request` → `Response`).

The HTTP API: [docs/api.md](docs/api.md).

## Development

```sh
bun run typecheck
bun test          # the graph, and the example backend on a repository made by the test
bun run build     # dist/: git-vuetify.js, style.css, the types
```

## License

MIT
