# The HTTP API

The API `createHttpGitApi(base)` asks, at `base + "git/…"` — the same in gad's
`gad ide` server (`web/ide/git.go`, base `api/ide/`), rvq's gitedit and the
example backend (`server/`, base `/api/`). Paths are of the workspace (a
repository, or a folder of one): clean, in it, not in `.git`. Refs (branches,
hashes, `main~5`) are no option and no range. Errors are `{"error": "…"}`:
400 for a request invalid, 404, 500.

| | | |
|---|---|---|
| `GET` | `git/changes` | `{"files": [{path, from?, status}]}`: changed and not committed (status M, A, D, R, ?) |
| `GET` | `git/diff?path` | `{path, from?, status, old, new, binary?}`: HEAD's and the current content; 404 when no more a change |
| `POST` | `git/save` `{path, content}` | `{"saved": true}`: the file written, its line endings kept |
| `GET` | `git/branches` | `{"branches": [{name, hash, remote?, current?, subject}], "default": name}` |
| `GET` | `git/log?ref&skip&limit[&path]` | `{"commits": [{hash, parents, author, email, date, subject, refs?, path?, from?}]}` — of a file: its history, renames followed (its path in each commit) |
| | filters | `q` (the message, or a hash's start), `author` (repeated: any; `Name <email>`), `name` (a file's: part or glob; not with `path`), `content` (a line added or taken out), `message`, `since`, `until` (`YYYY-MM-DD`) — texts, case aside |
| `GET` | `git/authors?ref[&path]` | `{"authors": [{name, email, commits}]}` |
| `GET` | `git/blame?ref&path` | `{"lines": [{hash, content}], "commits": {hash: {author, email, date, summary, path?}}, "binary"?}` — ref empty: the working file (lines not committed: hash `000…0`) |
| `GET` | `git/commit?hash` | the commit, its `message` and `files` (from its first parent) |
| `GET` | `git/commit/diff?hash&path[&from]` | a file's diff in the commit |
| `GET` | `git/compare?a&b` | `{"files": [...]}`: from the ref `a` to `b` (`b` empty: the working files) |
| `GET` | `git/compare/diff?a&b&path[&from]` | a file's diff from `a` to `b` |
| `GET` | `git/file?hash&path` | the file as the commit has it (a download) |
| `GET` | `git/patch?hash[&path]` | the commit's patch, of a file or whole (a download) |
