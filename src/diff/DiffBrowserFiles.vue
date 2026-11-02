<script setup lang="ts">
import { computed, h, inject, reactive, ref, watch, type FunctionalComponent, type Slot } from 'vue'
import { VChip, VIcon } from 'vuetify/components'
import { diffBrowserKey, renamedTo, statusColor, treePath, type DiffFile } from './diffBrowserContext'
import { gadFileIconFor } from './gadFileIcons'
import { fileIconFor } from './fileIcons'

// The tree panel of <vx-diff-browser>: the files changed, in their folders.
// A folder opens and closes; a file opens its tab. A renamed (moved) file is
// where it was, with where it went: its new name, or its new path when it
// went to another folder.
//
// The box Tree (kept in the browser) shows the folders as a tree; off, a
// list of two levels: each folder by its whole path from the repository's
// root (ctx.root), its files by their names under it.

defineProps<{ params?: unknown }>()
const ctx = inject(diffBrowserKey)!

interface Node {
  name: string
  path: string // the folder's, or the file's
  file?: DiffFile
  children: Node[]
}

// the tree, or the list (off)
const MODE_KEY = 'vx-diff-files-tree'
const treeMode = ref(true)
try {
  treeMode.value = localStorage.getItem(MODE_KEY) !== '0'
} catch {
  /* no storage */
}
watch(treeMode, (v) => {
  try {
    localStorage.setItem(MODE_KEY, v ? '1' : '0')
  } catch {
    /* no storage */
  }
})

// list is the files by their folders: a node a folder (its path from the
// repository's root; "/" the root itself), its files under it by name
const list = computed<Node[]>(() => {
  const root = ctx.root.value.replace(/^\/+|\/+$/g, '')
  const groups = new Map<string, Node>()
  for (const f of ctx.files.value) {
    const p = treePath(f)
    const i = p.lastIndexOf('/')
    const dir = [root, i < 0 ? '' : p.slice(0, i)].filter(Boolean).join('/')
    let g = groups.get(dir)
    if (!g) {
      g = { name: dir || '/', path: 'list:' + dir, children: [] }
      groups.set(dir, g)
    }
    g.children.push({ name: p.slice(i + 1), path: p, file: f, children: [] })
  }
  const out = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
  out.forEach((g) => g.children.sort((a, b) => a.name.localeCompare(b.name)))
  return out
})

const tree = computed<Node[]>(() => {
  const root: Node = { name: '', path: '', children: [] }
  for (const f of ctx.files.value) {
    const parts = treePath(f).split('/')
    let at = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      if (i === parts.length - 1) {
        at.children.push({ name: part, path, file: f, children: [] })
        return
      }
      let dir = at.children.find((c) => !c.file && c.name === part)
      if (!dir) {
        dir = { name: part, path, children: [] }
        at.children.push(dir)
      }
      at = dir
    })
  }
  // folders first, then by name
  const sort = (n: Node) => {
    n.children.sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.name.localeCompare(b.name))
    n.children.forEach(sort)
  }
  sort(root)
  return root.children
})

// the folders closed (all open at first)
const closed = reactive(new Set<string>())
const toggle = (path: string) => (closed.has(path) ? closed.delete(path) : closed.add(path))

// rows are the tree as the lines it shows: a node and its depth
const rows = computed(() => {
  const out: { node: Node; depth: number }[] = []
  const walk = (nodes: Node[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n, depth })
      if (!n.file && !closed.has(n.path)) walk(n.children, depth + 1)
    }
  }
  walk(treeMode.value ? tree.value : list.value, 0)
  return out
})

// Lead draws the browser's `lead` slot for a file.
const Lead: FunctionalComponent<{ file: DiffFile }> = (p) => {
  const slot: Slot | undefined = ctx.lead()
  return slot ? slot({ file: p.file }) : null
}
// Actions draws the browser's `actions` slot for a file.
const Actions: FunctionalComponent<{ file: DiffFile }> = (p) => {
  const slot: Slot | undefined = ctx.actions()
  return slot ? slot({ file: p.file }) : null
}
// a file's icon: the gad family's own (gad, gadt, gadx, *_test.gad), or
// the one of its extension, as the IDE's explorer shows them
const iconFor = fileIconFor
void h
</script>

<template>
  <div class="vx-diff-tree">
    <label class="vx-diff-tree-mode" data-diff-tree-mode>
      <input v-model="treeMode" type="checkbox" />
      <span>{{ ctx.labels.value.tree }}</span>
    </label>
    <div
      v-for="r in rows"
      :key="r.node.path + (r.node.file ? '' : '/')"
      class="vx-diff-tree-row"
      :class="{ 'vx-diff-tree-active': r.node.file && r.node.file.path === ctx.active.path }"
      :style="{ paddingLeft: 8 + r.depth * 14 + 'px' }"
      :title="r.node.file?.from ? r.node.file.from + ' → ' + r.node.file.path : r.node.path"
      :data-diff-path="r.node.file ? r.node.file.path : undefined"
      @click="r.node.file ? ctx.open(r.node.file) : toggle(r.node.path)"
    >
      <template v-if="r.node.file">
        <span v-if="ctx.lead()" class="vx-diff-tree-lead" @click.stop>
          <Lead :file="r.node.file" />
        </span>
        <img
          v-if="gadFileIconFor(r.node.file.path)"
          :src="gadFileIconFor(r.node.file.path)"
          alt=""
          width="16"
          height="16"
          class="me-1 vx-diff-tree-icon"
        />
        <v-icon v-else size="16" class="me-1" :icon="iconFor(r.node.file.path)" />
        <span
          class="vx-diff-tree-name"
          :class="{ 'vx-diff-tree-warning': r.node.file.warning }"
          :data-diff-warning="r.node.file.warning ? '' : undefined"
          >{{ r.node.name }}</span
        >
        <span v-if="r.node.file.from" class="vx-diff-tree-renamed" :data-renamed-to="r.node.file.path"
          >→ {{ renamedTo(r.node.file) }}</span
        >
        <v-chip size="x-small" variant="tonal" :color="statusColor(r.node.file.status)" class="ms-1">{{
          (r.node.file.status || '').trim()
        }}</v-chip>
        <span class="vx-diff-tree-actions" @click.stop>
          <Actions :file="r.node.file" />
        </span>
      </template>
      <template v-else>
        <v-icon
          size="16"
          class="me-1"
          :icon="closed.has(r.node.path) ? 'mdi-folder-outline' : 'mdi-folder-open-outline'"
        />
        <span class="vx-diff-tree-name">{{ r.node.name }}</span>
      </template>
    </div>
  </div>
</template>
