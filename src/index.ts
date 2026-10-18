// @gad-lang/git-vuetify — a git repository browsed and its changes compared,
// as Vuetify 3 components:
//
//   - GitPanel: the branches and their log (a graph), a file's history, two
//     refs compared; the log filtered (a search, authors, a file's name,
//     content, the message, a period); a file's blame;
//   - ChangesPanel: the files changed and not committed, compared with HEAD's
//     and edited;
//   - DiffBrowser / DiffMergeView: the diff browser (IntelliJ's compare);
//   - ResizeHandle / useStoredSize: the edges panes are resized by.
//
// Both panels drive a GitApi: createHttpGitApi is the client of its HTTP API
// (gad's `gad ide` server, rvq's gitedit, the example backend of server/).
import "./styles.css";

export { default as GitPanel } from "./GitPanel";
export { default as ChangesPanel } from "./ChangesPanel";
export { default as BlameView, NOT_COMMITTED } from "./BlameView";
export { default as HelpButton } from "./HelpButton";
export { graphRows, type GraphRow } from "./gitGraph";
export {
  createHttpGitApi,
  type GitApi,
  type GitAuthor,
  type GitBlame,
  type GitBranch,
  type GitCommit,
  type GitCommitDetail,
  type GitLogFilter,
} from "./api";
export {
  DEFAULT_GIT_MESSAGES,
  GIT_MESSAGES_PT_BR,
  GitMessagesKey,
  diffLabels,
  gitMessagesOf,
  type GitMessages,
} from "./messages";
export * from "./diff";
export { ResizeHandle, useStoredSize } from "./resize";
