<script setup lang="ts">
import { ref } from 'vue'

const status = ref('checking…')

fetch('/api/health')
  .then((res) => (res.ok ? 'server ok' : `server error ${res.status}`))
  .catch(() => 'server unreachable')
  .then((s) => (status.value = s))
</script>

<template>
  <main>
    <h1>Drawily</h1>
    <p>{{ status }}</p>
  </main>
</template>
