<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{ height: number; refraction: boolean }>()
const filterId = `liquid-${useId().replace(/[^a-z0-9-]/gi, '')}`
// SVG backdrop 在 Chromium 中用于网页折射演示，其他浏览器保留 CSS 玻璃预览。
const supportsRefraction = computed(() => props.refraction && /Chrom(e|ium)|Edg\//.test(navigator.userAgent) && CSS.supports('backdrop-filter', `url(#${filterId})`))
const filterStyle = computed(() => ({ '--glass-filter': `url(#${filterId}) blur(2px) saturate(1.2)` }))
// 灰色区域保持背景原位，四边只改变采样方向；滤镜只作用于材质层，文字始终清晰。
const refractionMap = computed(() => {
  const h = props.height
  const edge = 18
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="${h}" viewBox="0 0 340 ${h}"><defs><linearGradient id="l"><stop stop-color="#008080"/><stop offset="1" stop-color="#808080"/></linearGradient><linearGradient id="r"><stop stop-color="#808080"/><stop offset="1" stop-color="#ff8080"/></linearGradient><linearGradient id="t" x2="0" y2="1"><stop stop-color="#800080"/><stop offset="1" stop-color="#808080"/></linearGradient><linearGradient id="b" x2="0" y2="1"><stop stop-color="#808080"/><stop offset="1" stop-color="#80ff80"/></linearGradient></defs><rect width="340" height="${h}" fill="#808080"/><rect width="${edge}" height="${h}" fill="url(#l)"/><rect x="${340 - edge}" width="${edge}" height="${h}" fill="url(#r)"/><rect width="340" height="${edge}" fill="url(#t)"/><rect y="${h - edge}" width="340" height="${edge}" fill="url(#b)"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
})
</script>

<template>
  <div :class="['glass-surface', { 'has-svg-refraction': supportsRefraction }]" :style="filterStyle" aria-hidden="true">
    <svg v-if="refraction" class="glass-filter-definitions" width="0" height="0" focusable="false">
      <defs><filter :id="filterId" x="0" y="0" width="340" :height="height" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage :href="refractionMap" width="340" :height="height" preserveAspectRatio="none" result="edge-map" /><feGaussianBlur in="edge-map" stdDeviation="2" result="soft-map" /><feDisplacementMap in="SourceGraphic" in2="soft-map" scale="18" xChannelSelector="R" yChannelSelector="G" /></filter></defs>
    </svg>
    <div class="glass-backdrop"></div><div class="glass-wash"></div>
  </div>
</template>
