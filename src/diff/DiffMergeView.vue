<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MergeView, goToNextChunk, goToPreviousChunk } from '@codemirror/merge'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { languageExtensions } from './languages'

// The compare of <vx-diff-browser>'s tab, as IntelliJ's: the old (read
// only) and the current side by side — CodeMirror's merge view: the two
// aligned, scrolling as one, the changes marked —, the current editable
// (editable), the difference computed again as it is edited, and between
// the two, at each change, a button that takes the old's part into the
// current (revert). The current's edits — the reverts among them — have a
// history: undo, redo. Ctrl+S asks for a save.

const props = withDefaults(
  defineProps<{
    old: string
    current: string
    language?: string
    editable?: boolean
    dark?: boolean
    revertTitle?: string
  }>(),
  { language: '', editable: false, dark: false, revertTitle: 'Revert' },
)

const emit = defineEmits<{
  // the current's text, after each edit
  change: [text: string]
  // what the history may do
  history: [state: { canUndo: boolean; canRedo: boolean }]
  // Ctrl+S
  save: []
}>()

const host = ref<HTMLElement>()
let view: MergeView | undefined
const language = new Compartment()
const theme = new Compartment()
const languageB = new Compartment()
const themeB = new Compartment()

const themeOf = (dark: boolean) => (dark ? oneDark : [])

function emitHistory() {
  if (!view) return
  emit('history', { canUndo: undoDepth(view.b.state) > 0, canRedo: redoDepth(view.b.state) > 0 })
}

// the revert button: the old's part into the current
function revertControl() {
  const b = document.createElement('button')
  b.className = 'vx-merge-revert'
  b.title = props.revertTitle
  b.setAttribute('data-merge-revert', '')
  b.innerHTML = '<i class="mdi mdi-arrow-right-bold"></i>'
  return b
}

// the share of the width the old side takes, dragged by the edge between the
// two (kept across visits); half at first
const SPLIT_KEY = 'gad-ide.merge.split'
function storedSplit(): number {
  try {
    const v = Number(window.localStorage.getItem(SPLIT_KEY))
    if (v > 0.05 && v < 0.95) return v
  } catch {
    // no storage
  }
  return 0.5
}

// splitHandle puts, between the two editors of the merge view, the edge that
// resizes them: dragged, the old side's share of the width; double-clicked,
// half again
function splitHandle(root: HTMLElement) {
  const editors = root.querySelector<HTMLElement>('.cm-mergeViewEditors')
  const a = editors?.querySelector<HTMLElement>(':scope > .cm-mergeViewEditor')
  if (!editors || !a) return
  const set = (v: number) => {
    editors.style.setProperty('--vx-merge-a', `${(v * 100).toFixed(2)}%`)
    // (the labels of the two sides, above, follow it)
    document.documentElement.style.setProperty('--vx-merge-a', `${(v * 100).toFixed(2)}%`)
    try {
      window.localStorage.setItem(SPLIT_KEY, String(v))
    } catch {
      // no storage
    }
  }
  editors.style.setProperty('--vx-merge-a', `${(storedSplit() * 100).toFixed(2)}%`)
  document.documentElement.style.setProperty('--vx-merge-a', `${(storedSplit() * 100).toFixed(2)}%`)
  const handle = document.createElement('div')
  handle.className = 'gad-resize-handle gad-resize-handle--col vx-merge-split'
  handle.setAttribute('role', 'separator')
  handle.setAttribute('data-merge-split', '')
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      // a pointer the browser does not track: the moves still reach it
    }
    handle.classList.add('gad-resize-handle--dragging')
    const move = (ev: PointerEvent) => {
      const r = editors.getBoundingClientRect()
      set(Math.min(Math.max((ev.clientX - r.left) / r.width, 0.1), 0.9))
    }
    const up = () => {
      handle.classList.remove('gad-resize-handle--dragging')
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  })
  handle.addEventListener('dblclick', () => set(0.5))
  a.after(handle)
}

function build() {
  if (!host.value) return
  view?.destroy()
  const common = [lineNumbers(), highlightActiveLineGutter(), drawSelection(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }), bracketMatching()]
  view = new MergeView({
    parent: host.value,
    a: {
      doc: props.old,
      extensions: [...common, language.of([]), theme.of(themeOf(props.dark)), EditorState.readOnly.of(true), EditorView.editable.of(false)],
    },
    b: {
      doc: props.current,
      extensions: [
        ...common,
        highlightActiveLine(),
        history(),
        indentOnInput(),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (emit('save'), true) },
          // IntelliJ's: F7 the next change, Shift+F7 the previous
          { key: 'F7', preventDefault: true, run: goToNextChunk },
          { key: 'Shift-F7', preventDefault: true, run: goToPreviousChunk },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        languageB.of([]),
        themeB.of(themeOf(props.dark)),
        EditorState.readOnly.of(!props.editable),
        EditorView.editable.of(props.editable),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) emit('change', u.state.doc.toString())
          if (u.docChanged || u.transactions.length) emitHistory()
        }),
      ],
    },
    revertControls: props.editable ? 'a-to-b' : undefined,
    renderRevertControl: revertControl,
    highlightChanges: true,
    gutter: true,
  })
  splitHandle(view.dom)
  loadLanguage()
  emitHistory()
}

async function loadLanguage() {
  const ext = await languageExtensions(props.language)
  if (!view) return
  view.a.dispatch({ effects: language.reconfigure(ext) })
  view.b.dispatch({ effects: languageB.reconfigure(ext) })
}

onMounted(build)
onBeforeUnmount(() => view?.destroy())

watch(() => props.dark, (dark) => {
  view?.a.dispatch({ effects: theme.reconfigure(themeOf(dark)) })
  view?.b.dispatch({ effects: themeB.reconfigure(themeOf(dark)) })
})
watch(() => props.language, loadLanguage)
// another file, or the same file as the server has it again: built anew
// (watched by value — a getter giving a new array each time would rebuild on
// every change of the parent)
watch(() => props.old, build)
// the current given anew (the file reloaded) that is not what the editor has
watch(() => props.current, (v) => {
  if (view && view.b.state.doc.toString() !== v) build()
})
watch(() => props.editable, build)

// go moves the current's cursor to the next (or the previous) change, and
// scrolls to it
function go(next: boolean) {
  if (!view) return
  ;(next ? goToNextChunk : goToPreviousChunk)(view.b)
  view.b.focus()
}

defineExpose({
  next: () => go(true),
  prev: () => go(false),
  undo: () => view && undo(view.b),
  redo: () => view && redo(view.b),
  // the current's text now
  text: () => view?.b.state.doc.toString() ?? props.current,
  focus: () => view?.b.focus(),
})
</script>

<template>
  <div ref="host" class="vx-merge-host" :class="{ 'vx-merge-dark': dark }"></div>
</template>

<style>
.vx-merge-host {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.vx-merge-host .cm-mergeView {
  height: 100%;
  overflow: auto;
}
.vx-merge-host .cm-editor {
  font-size: 0.8125rem;
}
.vx-merge-host .cm-editor.cm-focused {
  outline: none;
}
.vx-merge-host .cm-scroller {
  font-family: 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}
/* the two sides: the old's share of the width dragged (splitHandle) */
.vx-merge-host .cm-mergeViewEditors > .cm-mergeViewEditor:first-child {
  flex: 0 0 var(--vx-merge-a, 50%);
  min-width: 0;
}
.vx-merge-host .cm-mergeViewEditors > .cm-mergeViewEditor:last-child {
  flex: 1 1 0;
  min-width: 0;
}
.vx-merge-host .vx-merge-split {
  flex: 0 0 5px;
  align-self: stretch;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
}
.vx-merge-host .vx-merge-split.gad-resize-handle--dragging,
.vx-merge-host .vx-merge-split:hover {
  background: rgba(var(--v-theme-primary), 0.35);
}
/* the revert buttons, between the two */
.vx-merge-host .cm-merge-revert {
  width: 28px;
}
.vx-merge-host .vx-merge-revert {
  display: block;
  width: 24px;
  height: 20px;
  margin: 0 auto;
  padding: 0;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  font-size: 14px;
  line-height: 18px;
}
.vx-merge-host .vx-merge-revert:hover {
  background: rgba(var(--v-theme-primary), 0.12);
}
</style>
