import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import GridView from './views/GridView.vue'
import TimelineView from './views/TimelineView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: GridView },
    { path: '/timeline', component: TimelineView },
  ],
})

createApp(App).use(router).mount('#app')
