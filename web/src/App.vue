<script setup lang="ts">
import { ref } from 'vue'

const status = ref('checking…')

fetch('/api/health')
  .then((res) => {
    // In dev Vite serves the page without auth, so the API is where a missing login shows up.
    if (res.status === 401) location.assign('/api/login')
    return res.ok ? 'server ok' : `server error ${res.status}`
  })
  .catch(() => 'server unreachable')
  .then((s) => (status.value = s))
</script>

<template>
  <main>
    <h1>Drawily</h1>
    <p>{{ status }}</p>
  </main>
</template>
