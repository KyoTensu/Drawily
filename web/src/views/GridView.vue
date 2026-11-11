<script setup lang="ts">
import type { Drawing } from '../api'
import DrawingCard from '../DrawingCard.vue'

defineProps<{ drawings: Drawing[] }>()
</script>

<template>
  <div class="cards">
    <DrawingCard v-for="d in drawings" :key="d.id" :drawing="d" show-date />
  </div>
</template>
