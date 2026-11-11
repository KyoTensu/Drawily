<script setup lang="ts">
import { provide, ref } from 'vue'
import { getDrawings, reloadKey, type Drawing } from './api'

const drawings = ref<Drawing[]>()
const error = ref('')

async function load() {
  try {
    drawings.value = await getDrawings()
  } catch (e) {
    error.value = e instanceof TypeError ? 'Server unreachable.' : String((e as Error).message)
  }
}
load()
provide(reloadKey, load)
</script>

<template>
  <header>
    <h1>Drawily</h1>
    <nav aria-label="View">
      <RouterLink to="/">Grid</RouterLink>
      <RouterLink to="/timeline">Timeline</RouterLink>
    </nav>
  </header>
  <main>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!drawings">Loading…</p>
    <p v-else-if="!drawings.length">No drawings yet. Share one from Procreate with the upload Shortcut.</p>
    <RouterView v-else :drawings="drawings" />
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  --muted: color-mix(in srgb, currentColor 60%, transparent);
  --line: color-mix(in srgb, currentColor 15%, transparent);
}
body {
  margin: 0;
}
header {
  display: flex;
  align-items: baseline;
  gap: 1.5rem;
  padding: 0 1rem;
  border-bottom: 1px solid var(--line);
}
header h1 {
  font-size: 1.25rem;
}
nav {
  display: flex;
  gap: 1rem;
}
nav a {
  color: inherit;
  text-decoration: none;
  padding: 0.25rem 0;
}
nav a.router-link-exact-active {
  border-bottom: 2px solid currentColor;
}
main {
  padding: 1rem;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(12rem, 100%), 1fr));
  gap: 1rem;
}
</style>
