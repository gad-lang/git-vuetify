<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch, type FunctionalComponent, type Slot } from 'vue'
import { VBtn, VChip, VDivider, VIcon, VProgressCircular, VProgressLinear } from 'vuetify/components'
import DiffMergeView from './DiffMergeView.vue'
import { languageOf } from './languages'
import { diffBrowserKey, statusColor, unchangedContent, type DiffFile, type SaveState } from './diffBrowserContext'

// A tab of <vx-diff-browser>: a file, the old and the current side by side
// as IntelliJ compares them (DiffMergeView). A renamed (moved) one says so —
// from where to where —, its content before compared with its content now;
// with its content the same, that is all. With save given, the current is
// edited here: the difference computed again, a change of the old taken
// back by its button, the edits undone and redone, saved (Ctrl+S too).

const props = defineProps<{ params: { params: { path: string } } }>()
const ctx = inject(diffBrowserKey)!
const path = computed(() => props.params.params.path)

// the file's summary, and its content once had (ctx.request)
const entry = computed(() => ctx.files.value.find((f) => f.path === path.value))
const content = computed(() => ctx.content(path.value))
// the diff, once the server set it: over the summary
const file = computed(() => {
  const c = content.value
  return c?.value ? { ...c.file, ...c.value } : undefined
})
onMounted(() => {
  if (entry.value) ctx.request(entry.value)
})

// Toolbar draws the browser's `toolbar` slot for the file.
const Toolbar: FunctionalComponent<{ file: DiffFile }> = (p) => {
  const slot: Slot | undefined = ctx.toolbar()
  return slot ? slot({ file: p.file }) : null
}
// AltView draws the browser's `view` slot for the file (ctx.altView).
const AltView: FunctionalComponent<{ file: DiffFile }> = (p) => {
  const slot: Slot | undefined = ctx.view()
  return slot ? slot({ file: p.file }) : null
}
const alt = computed(() => !!file.value && ctx.altView(file.value))

const editable = computed(() => !!file.value && ctx.editable(file.value))
const merge = ref<InstanceType<typeof DiffMergeView>>()

// the current as edited, and as last saved (or loaded)
const text = ref('')
const savedText = ref('')
watch(
  () => file.value?.new,
  (v) => {
    if (v === undefined) return
    if (text.value === savedText.value) text.value = v ?? ''
    savedText.value = v ?? ''
  },
  { immediate: true },
)
const dirty = computed(() => !!file.value && text.value !== savedText.value)
watch(dirty, (d) => ctx.markDirty(path.value, d))

const hist = reactive({ canUndo: false, canRedo: false })
const saving = ref(false)
const saveError = ref('')
const justSaved = ref(false)

function onChange(t: string) {
  text.value = t
  justSaved.value = false
}

// save asks the server to write the current as edited (ctx.save): its
// answer sets the state's saved, or error
function save() {
  if (!editable.value || saving.value || !dirty.value) return
  const state = reactive<SaveState>({ value: text.value, saved: false, error: undefined })
  saving.value = true
  saveError.value = ''
  const stop = watch(
    () => [state.saved, state.error],
    () => {
      if (state.error) {
        saving.value = false
        saveError.value = state.error
        stop()
      } else if (state.saved) {
        saving.value = false
        savedText.value = state.value
        justSaved.value = true
        // the file as it is now: what a tab opened again shows
        if (content.value?.value) content.value.value.new = state.value
        stop()
      }
    },
  )
  ctx.save(path.value, state)
}
</script>

<template>
  <div v-if="entry" class="vx-diff-file" :data-diff-file="entry.path">
    <div class="vx-diff-file-head">
      <v-chip size="x-small" variant="tonal" :color="statusColor(entry.status)" class="me-2">{{
        (entry.status || '').trim()
      }}</v-chip>
      <template v-if="entry.from"
        ><code>{{ entry.from }}</code><span class="mx-2">→</span><code>{{ entry.path }}</code></template
      >
      <code v-else>{{ entry.path }}</code>
    </div>
    <div v-if="content?.error" class="pa-4 text-error" data-diff-error>
      {{ content.error }}
      <v-btn size="small" variant="text" icon="mdi-refresh" class="ms-1" @click="ctx.request(entry)" />
    </div>
    <div v-else-if="!file" class="vx-diff-loading" data-diff-loading>
      <v-progress-linear indeterminate color="primary" />
      <div class="pa-4 text-medium-emphasis d-flex align-center ga-2">
        <v-progress-circular indeterminate size="18" width="2" color="primary" />
        <span>{{ ctx.labels.value.loading }}</span>
      </div>
    </div>
    <div v-else-if="unchangedContent(file) && !editable" class="pa-4 vx-diff-renamed" data-renamed-only>
      {{ ctx.labels.value.renamed }} <code>{{ file.path }}</code>. {{ ctx.labels.value.unchanged }}
    </div>
    <div v-else-if="file.binary" class="pa-4 text-medium-emphasis">{{ ctx.labels.value.binary }}</div>
    <template v-else>
      <div class="vx-diff-toolbar" data-diff-toolbar>
        <!-- the changes, one by one (F7, Shift+F7) -->
        <template v-if="!alt">
        <v-btn size="small" variant="text" icon="mdi-arrow-up" density="comfortable" :title="ctx.labels.value.prev"
          data-diff-prev @click="merge?.prev()" />
        <v-btn size="small" variant="text" icon="mdi-arrow-down" density="comfortable" :title="ctx.labels.value.next"
          data-diff-next @click="merge?.next()" />
        </template>
        <!-- the browser's toolbar slot ({ file }): a download -->
        <Toolbar :file="file" />
        <v-divider v-if="editable" vertical class="mx-2" />
        <template v-if="editable">
        <v-btn size="small" variant="text" prepend-icon="mdi-undo" :disabled="!hist.canUndo" data-diff-undo
          @click="merge?.undo()">{{ ctx.labels.value.undo }}</v-btn>
        <v-btn size="small" variant="text" prepend-icon="mdi-redo" :disabled="!hist.canRedo" data-diff-redo
          @click="merge?.redo()">{{ ctx.labels.value.redo }}</v-btn>
        <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-content-save" class="ms-2"
          :loading="saving" :disabled="!dirty" data-diff-save @click="save">{{ ctx.labels.value.save }}</v-btn>
        <span v-if="saveError" class="ms-3 text-error text-body-2" data-diff-save-error>{{ saveError }}</span>
        <span v-else-if="saving" class="ms-3 text-medium-emphasis text-body-2">{{ ctx.labels.value.saving }}</span>
        <span v-else-if="dirty" class="ms-3 text-warning text-body-2" data-diff-dirty>● {{ ctx.labels.value.unsaved }}</span>
        <span v-else-if="justSaved" class="ms-3 text-success text-body-2" data-diff-saved>
          <v-icon size="16" icon="mdi-check" /> {{ ctx.labels.value.saved }}</span>
        </template>
      </div>
      <AltView v-if="alt" :file="file" />
      <template v-else>
      <div class="vx-diff-sides-labels">
        <div class="vx-diff-side-label">{{ ctx.labels.value.old }}</div>
        <div class="vx-diff-side-label">{{ ctx.labels.value.new }}</div>
      </div>
      <DiffMergeView
        ref="merge"
        class="vx-diff-merge"
        :old="file.old || ''"
        :current="file.new || ''"
        :language="file.language || languageOf(file.path)"
        :editable="editable"
        :dark="ctx.dark.value"
        :revert-title="ctx.labels.value.revert"
        @change="onChange"
        @history="(h) => Object.assign(hist, h)"
        @save="save"
      />
      </template>
    </template>
  </div>
</template>
