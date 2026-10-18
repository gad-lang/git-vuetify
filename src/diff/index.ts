// The diff browser — the changes of a set of files, browsed, the current side
// edited as IntelliJ's compare does — and the CodeMirror languages of its
// merge view: the Changes and Git panels', gad's IDE's, and rvq's
// <vx-diff-browser> (aliased to this source).
export { default as DiffBrowser } from "./DiffBrowser.vue";
export { default as DiffMergeView } from "./DiffMergeView.vue";
export { LANGUAGES, languageExtensions, languageOf, type LanguageOptions } from "./languages";
export {
  renamedTo,
  statusColor,
  treePath,
  unchangedContent,
  type Content,
  type DiffFile,
  type SaveState,
} from "./diffBrowserContext";
