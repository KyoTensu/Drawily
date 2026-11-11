<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { formatDay, post, reloadKey, type Drawing } from '../api'

const props = defineProps<{ drawings: Drawing[]; id: string }>()
const reload = inject(reloadKey)!

const drawing = computed(() => props.drawings.find((d) => d.id === Number(props.id)))
const others = computed(() => props.drawings.filter((d) => d.id !== Number(props.id)))

const mergeFrom = ref<number>()
const splitInto = ref<number>()
const busy = ref(false)
const error = ref('')
// Merge/split can change which file gives the preview, so the image is reloaded after each.
const version = ref(0)
const noPreview = ref(false)

async function run(path: string, body?: object) {
  busy.value = true
  error.value = ''
  splitInto.value = undefined
  try {
    const res = await post(path, body)
    await reload()
    if (path.endsWith('/split')) splitInto.value = res.drawingId
    mergeFrom.value = undefined
    noPreview.value = false
    version.value++
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const size = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} kB` : `${(n / 1e6).toFixed(1)} MB`)
</script>

<template>
  <p><RouterLink to="/">← All drawings</RouterLink></p>
  <p v-if="!drawing">This drawing doesn't exist. It may have been merged into another one.</p>
  <article v-else class="drawing">
    <div class="preview">
      <span v-if="noPreview">No preview</span>
      <img v-else :src="`/api/drawings/${drawing.id}/preview?v=${version}`" :alt="drawing.title" @error="noPreview = true" />
    </div>
    <div>
      <h2>{{ drawing.title }}</h2>
      <p class="muted">{{ formatDay(drawing.drawnOn) }}</p>

      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="splitInto" role="status">
        Moved to <RouterLink :to="`/drawings/${splitInto}`">a new drawing</RouterLink>.
      </p>

      <h3>Files</h3>
      <ul class="files">
        <li v-for="f in drawing.files" :key="f.id">
          <a :href="`/api/files/${f.id}`">{{ f.filename }}</a>
          <span class="muted">{{ f.format.toUpperCase() }} · {{ size(f.size) }}</span>
          <button v-if="drawing.files.length > 1" type="button" :disabled="busy" @click="run(`/api/files/${f.id}/split`)">
            Split into its own drawing
          </button>
        </li>
      </ul>

      <form v-if="others.length" @submit.prevent="run(`/api/drawings/${drawing.id}/merge`, { from: mergeFrom })">
        <label for="merge-from">Merge another drawing into this one</label>
        <div class="row">
          <select id="merge-from" v-model="mergeFrom" required>
            <option :value="undefined" disabled>Choose a drawing…</option>
            <option v-for="d in others" :key="d.id" :value="d.id">{{ d.title }} — {{ formatDay(d.drawnOn) }}</option>
          </select>
          <button :disabled="busy">Merge</button>
        </div>
      </form>
    </div>
  </article>
</template>

<style scoped>
.drawing {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
  gap: 1.5rem;
  align-items: start;
}
.preview {
  position: relative;
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  background: var(--line);
  color: var(--muted);
  border-radius: 0.5rem;
  overflow: hidden;
}
.preview img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
h2 {
  margin: 0;
  overflow-wrap: anywhere;
}
.muted {
  color: var(--muted);
}
.files {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.files li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
}
.files a {
  overflow-wrap: anywhere;
}
form {
  margin-top: 1.5rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.375rem;
}
select {
  min-width: 0;
  flex: 1;
}
</style>
