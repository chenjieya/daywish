<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
const paths: Record<string, string> = {
  sun: 'M3 16h18M5 20h14M7 12a5 5 0 0 1 10 0M12 2v2M3.5 5.5l1.4 1.4M20.5 5.5l-1.4 1.4',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l-.6 2.1-1.8 1L4.5 6l-2 3.5L4 11v2l-1.5 1.5 2 3.5 2.1-.1 1.8 1L9 21h6l.6-2.1 1.8-1 2.1.1 2-3.5L20 13v-2l1.5-1.5-2-3.5-2.1.1-1.8-1L15 3z',
  pin: 'M9 3h6l-1 6 4 4v2h-5v6h-2v-6H6v-2l4-4z',
  close: 'M6 6l12 12M18 6 6 18',
  minus: 'M5 12h14',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M7 3v4M17 3v4M3 10h18M8 14h2m4 0h2m-8 4h2',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  wallet: 'M4 6V5a2 2 0 0 1 2-2h12v4M4 7h16v14H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2m16 5h-6v5h6m-3-2.5h.01',
  leaf: 'M20 3C8 2 2 9 6 15s14 5 14-12M5 21 16 9',
  back: 'm14 5-7 7 7 7',
  monitor: 'M3 3h18v14H3zM8 21h8m-4-4v4',
}
</script>
<template><svg :width="size ?? 20" :height="size ?? 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] ?? paths.sun" /></svg></template>
