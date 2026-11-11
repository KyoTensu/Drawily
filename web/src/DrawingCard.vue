<script setup lang="ts">
import { ref } from 'vue'
import { formatDay, type Drawing } from './api'

defineProps<{ drawing: Drawing; showDate?: boolean }>()
const noPreview = ref(false)
</script>

<template>
  <article class="card">
    <div class="preview">
      <span v-if="noPreview">No preview</span>
      <img v-else :src="`/api/drawings/${drawing.id}/preview`" :alt="drawing.title" loading="lazy" @error="noPreview = true" />
    </div>
    <h2>{{ drawing.title }}</h2>
    <p v-if="showDate" class="date">{{ formatDay(drawing.drawnOn) }}</p>
    <ul class="files">
      <li v-for="f in drawing.files" :key="f.id">
        <a :href="`/api/files/${f.id}`" :aria-label="`Download ${f.filename}`" :title="f.filename">{{ f.format.toUpperCase() }}</a>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.card {
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  overflow: hidden;
}
.preview {
  position: relative;
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  background: var(--line);
  color: var(--muted);
}
.preview img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
h2 {
  font-size: 1rem;
  margin: 0.5rem 0.75rem 0;
  overflow-wrap: anywhere;
}
.date {
  margin: 0.25rem 0.75rem 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.files {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  list-style: none;
  padding: 0;
  margin: 0.5rem 0.75rem 0.75rem;
}
.files a {
  display: inline-block;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 1rem;
  color: inherit;
  text-decoration: none;
}
</style>
