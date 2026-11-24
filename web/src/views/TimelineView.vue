<script setup lang="ts">
import { computed } from 'vue'
import { formatDay, type Drawing } from '../api'
import DrawingCard from '../DrawingCard.vue'

const props = defineProps<{ drawings: Drawing[] }>()

// The API sorts newest day first, so grouping keeps that order.
const days = computed(() => Map.groupBy(props.drawings, (d) => d.drawnOn))
</script>

<template>
  <section v-for="[day, list] in days" :key="day" class="day">
    <h2>
      <time :datetime="day">{{ formatDay(day) }}</time>
    </h2>
    <div class="cards">
      <DrawingCard v-for="d in list" :key="d.id" :drawing="d" />
    </div>
  </section>
</template>

<style scoped>
.day + .day {
  margin-top: 2rem;
}
h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--line);
}
</style>
