<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ title: string; detail: string; value: number | string; progress: number | null; status?: string; progressHint: string }>()
defineEmits<{ click: [] }>()
const percentage = computed(() => props.progress === null ? '—' : `${Math.round(props.progress)}%`)
const shortDate = computed(() => props.detail.match(/^\d+月\d+日/)?.[0] ?? '')
</script>
<template>
  <button class="countdown-row" :title="detail" @click="$emit('click')">
    <span class="row-heading"><span class="row-title">{{ title }}<span class="row-date">{{ shortDate }}</span></span><span :class="['row-remaining', { 'is-today': status }]">{{ status ?? '还有' }}<strong v-if="!status">{{ value }}</strong><span v-if="!status">天</span></span></span>
    <span class="progress-line"><span class="progress-track" role="progressbar" :aria-label="`${title}，${progressHint}`" :aria-valuenow="progress === null ? undefined : Math.round(progress)" :aria-valuemin="0" :aria-valuemax="100" :aria-valuetext="progress === null ? '缺少上一周期数据' : `${progressHint}，已过 ${percentage}`" :title="`${progressHint}，${progress === null ? '暂缺上一周期数据' : `已过 ${percentage}`}`"><span class="progress-fill" :style="{ width: `${progress ?? 0}%` }"></span></span><span class="progress-percent">{{ percentage }}</span></span>
  </button>
</template>
