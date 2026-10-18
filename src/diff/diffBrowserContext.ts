import type { ComputedRef, InjectionKey, Slot } from 'vue'

// What the panels of <vx-diff-browser> share with it (provide/inject: dockview
// mounts them apart, with the browser's provides).

export interface DiffFile {
  path: string
  from?: string // a renamed (moved) file's path before: old is its content there
  status?: string // as git says it: M, A, D, R, ?
  language?: string // Prism's
  old?: string
  new?: string
  binary?: boolean
  readOnly?: boolean // not to be edited here, though save is given
  warning?: boolean // its name highlighted in the tree (a file to look at: one removed on purpose)
  removed?: number[] // 1-based lines of old
  added?: number[] // of new
  delRanges?: Record<number, [number, number, number][]>
  insRanges?: Record<number, [number, number, number][]>
}

// Content is what a tab has of its file: given to load, a reactive object
// whose value the server sets — the event's response runs
// `content.value = {…}` (the file's diff: contents and how they differ), or
// `content.error = "…"`. file is the file's summary.
export interface Content {
  file: DiffFile
  value?: DiffFile
  error?: string
}

// SaveState is what save is given with a file's path: a reactive object,
// value the text to save; the server sets saved = true, or error.
export interface SaveState {
  value: string
  saved?: boolean
  error?: string
}

export interface Labels {
  old: string
  new: string
  binary: string
  renamed: string
  unchanged: string
  loading: string
  undo: string
  redo: string
  save: string
  saving: string
  saved: string
  unsaved: string
  revert: string
  prev: string
  next: string
}

export interface DiffBrowserContext {
  // the summary: the files' paths, status, origins, languages — their
  // contents too when no load is given
  files: ComputedRef<DiffFile[]>
  // the content of an opened file: asked for (load) the first time its tab
  // shows it, forgotten when the tab closes
  content: (path: string) => Content | undefined
  request: (file: DiffFile) => void
  active: { path: string }
  open: (file: DiffFile) => void
  labels: ComputedRef<Labels>
  // the theme's darkness, for the editors
  dark: ComputedRef<boolean>
  // whether a file is edited here: save given, the file not read only
  editable: (file: DiffFile) => boolean
  // asks the server to save the file at path: save(path, state)
  save: (path: string, state: SaveState) => void
  // marks a file's tab as having changes not saved
  markDirty: (path: string, dirty: boolean) => void
  // the browser's `actions` slot, rendered by each file of the tree
  actions: () => Slot | undefined
  // the browser's `toolbar` slot, rendered in each file's toolbar
  toolbar: () => Slot | undefined
  // whether the file is shown by the `view` slot, in place of its compare
  altView: (file: DiffFile) => boolean
  // the browser's `view` slot
  view: () => Slot | undefined
}

export const diffBrowserKey: InjectionKey<DiffBrowserContext> = Symbol('vx-diff-browser')

// renamedTo is where a renamed file went, as its old place sees it: its new
// name, in the same folder; its new path from the root, in another.
export const renamedTo = (f: DiffFile): string => {
  if (!f.from) return ''
  const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
  return dir(f.from) === dir(f.path) ? f.path.slice(f.path.lastIndexOf('/') + 1) : f.path
}

// unchanged reports whether a renamed file's content is the same.
export const unchangedContent = (f: DiffFile): boolean => !!f.from && !f.binary && (f.old ?? '') === (f.new ?? '')

// treePath is where a file is in the tree: a renamed one where it was.
export const treePath = (f: DiffFile): string => f.from || f.path

// statusColor is the color of a status git says (M, A, D, R, ?).
export const statusColor = (s?: string) =>
  ({ A: 'success', '?': 'success', D: 'error', M: 'warning', R: 'info' } as Record<string, string>)[
    (s || '').trim().charAt(0)
  ] || 'grey'
