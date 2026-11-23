<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../../src/components/AppIcon.vue'
import CountdownRow from '../../src/components/CountdownRow.vue'
import { defaultSettings } from '../../src/types/settings'
import type { CalendarData } from '../../src/types/calendar'
import { dateKey, nextHoliday, nextPayday, nextSpring, formatDate, paydayProgress, holidayProgress, springProgress } from '../../src/lib/dates'
import rawCalendar from '../../shared/calendar.json'

const calendar = rawCalendar as CalendarData
const day = ref(10), frost = ref(84), controls = ref(false)
const position = ref({ x: 0, y: 0 })
const settings = computed(() => ({ ...defaultSettings, payday: day.value }))
const today = dateKey(new Date())
const payday = computed(() => nextPayday(today, settings.value, calendar))
const holiday = nextHoliday(today, calendar)
const spring = (() => { try { return nextSpring(today) } catch { return null } })()
const progress = computed(() => ({ payday: paydayProgress(today, settings.value, calendar), holiday: holidayProgress(today, calendar), spring: springProgress(today) }))
const date = today.slice(5).replace('-', '/')
let start: { x: number; y: number; clientX: number; clientY: number } | null = null
function drag(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
  start = { ...position.value, clientX: event.clientX, clientY: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (!start) return
  position.value = { x: Math.max(-24, Math.min(24, start.x + event.clientX - start.clientX)), y: Math.max(-32, Math.min(32, start.y + event.clientY - start.clientY)) }
}
</script>

<template>
  <div class="demo-landscape">
    <div class="demo-orbit orbit-one"></div><div class="demo-orbit orbit-two"></div>
    <div class="demo-caption"><span>桌面的一小角</span><span>留给即将到来的好日子</span></div>
    <div class="demo-widget-host frosted-surface" :style="{ transform: `translate(${position.x}px, ${position.y}px)`, '--frost-alpha': frost / 100 }">
      <div class="widget">
        <div class="glass-surface"><div class="glass-backdrop"></div><div class="glass-wash"></div></div>
        <div class="widget-content">
          <header class="titlebar" @pointerdown="drag" @pointermove="move" @pointerup="start = null" @pointercancel="start = null" @lostpointercapture="start = null">
            <div class="app-brand"><AppIcon name="sun" :size="17" /><span>好日将至</span></div>
            <div class="window-buttons"><button class="icon-button" aria-label="恢复预览位置" title="恢复位置" @click="position = { x: 0, y: 0 }"><AppIcon name="pin" :size="13" /></button><button class="icon-button" :aria-expanded="controls" aria-label="调整预览" title="调整预览" @click="controls = !controls"><AppIcon name="settings" :size="15" /></button></div>
          </header>
          <div class="countdown-list">
            <CountdownRow title="距离发薪" :detail="formatDate(payday.date)" :value="payday.days" :progress="progress.payday" progress-hint="本次发薪周期进度" @click="controls = true" />
            <CountdownRow :title="holiday ? `距离${holiday.name}` : '下个节假日'" :detail="holiday ? formatDate(holiday.date) : '等待公布'" :value="holiday?.days ?? '—'" :progress="progress.holiday" :status="holiday?.ongoing ? '正在放假' : undefined" progress-hint="距离下一假期的周期进度" @click="controls = true" />
            <CountdownRow title="距离春节" :detail="spring ? formatDate(spring.date) : '待更新'" :value="spring?.days ?? '—'" :progress="progress.spring" progress-hint="相邻正月初一之间的进度" @click="controls = true" />
          </div>
          <footer class="widget-footer"><span>北京时间<span class="footer-dot">·</span>{{ date }}</span><span>• 日历</span></footer>
        </div>
      </div>
    </div>
    <div v-if="controls" class="demo-controls">
      <label>每月发薪<select v-model.number="day"><option v-for="n in 28" :key="n" :value="n">{{ n }} 日</option></select></label>
      <label>磨砂浓度<input v-model.number="frost" type="range" min="70" max="96" /><output>{{ frost }}%</output></label>
      <button @click="controls = false">完成</button>
    </div>
    <span v-else class="demo-hint">拖动小窗标题栏，或点齿轮试一试</span>
  </div>
</template>
