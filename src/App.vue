<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDaywish } from './hooks/useDaywish'
import { daysBetween, formatDate } from './lib/dates'
import AppIcon from './components/AppIcon.vue'
import CountdownRow from './components/CountdownRow.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import GlassSurface from './components/GlassSurface.vue'
import { viewMode, windowLayout } from './types/window'
import { useAppUpdates } from './hooks/useAppUpdates'

const app = useDaywish()
const { settings, loading, error, material, native, canLaunchAtLogin, payday, holiday, spring, upcoming, dateLabel, data, persist, progress, zoneLabel, calendarStatus, checking, checkUpdates } = app
const { appUpdate, appUpdateAction } = useAppUpdates(persist)
const panel = ref<'settings' | 'holidays' | null>(null)
const panelElement = ref<HTMLElement>()
const trigger = ref<HTMLElement | null>(null)
const previewHidden = ref(false)
const macPreview = !native && new URLSearchParams(window.location.search).get('preview') === 'macos'
const mode = computed(() => viewMode(panel.value !== null, settings.value.compact))
const style = computed(() => ({ '--glass-alpha': settings.value.opacity / 100, '--frost-alpha': settings.value.frostOpacity / 100, '--widget-width': `${windowLayout.width}px`, '--dashboard-height': `${windowLayout.dashboard}px`, '--compact-height': `${windowLayout.compact}px`, '--panel-height': `${windowLayout.panel}px` }))
const glassHeight = computed(() => windowLayout[mode.value])
const yearRange = computed(() => data.value.sources.map(s => s.year).join('、'))
let unsubscribe: (() => void) | undefined

async function openPanel(name: 'settings' | 'holidays') {
  trigger.value = document.activeElement as HTMLElement
  panel.value = name
  await nextTick()
  panelElement.value?.querySelector<HTMLElement>('button,select,input')?.focus()
}
function closePanel() { panel.value = null; void nextTick(() => trigger.value?.focus()) }
watch([mode, loading], () => {
  if (loading.value || !window.daywish) return
  void window.daywish.setViewMode(mode.value).catch(() => { error.value = '窗口尺寸更新失败，请退出后重新打开应用。' })
}, { immediate: true, flush: 'post' })
function keydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); void openPanel('settings') }
  if (event.key === 'Escape' && panel.value) closePanel()
  if (event.key !== 'Tab' || !panel.value || !panelElement.value) return
  const items = Array.from(panelElement.value.querySelectorAll<HTMLElement>('button:not(:disabled),select,input:not(:disabled),a[href]'))
  const first = items[0], last = items.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(() => {
  document.documentElement.classList.toggle('native', native)
  document.addEventListener('keydown', keydown)
  unsubscribe = window.daywish?.on('open-settings', () => { void openPanel('settings') })
})
onUnmounted(() => { document.removeEventListener('keydown', keydown); unsubscribe?.() })
async function hide() {
  await persist()
  if (native) window.daywish?.windowAction('hide')
  else previewHidden.value = true
}
</script>

<template>
  <div :class="['desktop', { 'is-native': native, 'frosted-surface': !macPreview }]" :style="style">
    <div v-if="!native" class="wallpaper" aria-hidden="true"><div class="wallpaper-light"></div><div class="wallpaper-ridge ridge-back"></div><div class="wallpaper-ridge ridge-front"></div></div>
    <header v-if="!native" class="preview-heading"><span class="preview-brand"><AppIcon name="sun" :size="21" />好日将至</span><span>桌面预览</span></header>
    <button v-if="previewHidden && !native" class="reopen-button" @click="previewHidden = false"><AppIcon name="sun" :size="17" />重新打开小窗</button>
    <main v-else :class="['widget', { compact: settings.compact, 'panel-open': panel }]" :data-view="mode" aria-label="好日将至桌面小窗">
      <GlassSurface :height="glassHeight" :refraction="macPreview" />
      <div v-show="panel === null" class="widget-content">
        <header class="titlebar"><div class="app-brand"><AppIcon name="sun" :size="17" /><span>好日将至</span></div><div class="window-buttons"><button :class="['icon-button', 'pin-button', { active: settings.alwaysOnTop }]" :aria-pressed="settings.alwaysOnTop" title="始终置顶" aria-label="始终置顶" @click="settings.alwaysOnTop = !settings.alwaysOnTop"><AppIcon name="pin" :size="13" /></button><button class="icon-button" title="设置" aria-label="打开设置" @click="openPanel('settings')"><AppIcon name="settings" :size="15" /></button><button class="icon-button" title="收起小窗" aria-label="收起小窗" @click="hide"><AppIcon name="close" :size="15" /></button></div></header>
        <div class="countdown-list">
          <CountdownRow title="距离发薪" :detail="`${formatDate(payday.date)} · ${payday.note}`" :value="loading ? '—' : payday.days" :progress="progress.payday" :status="payday.days === 0 ? '今天发薪' : undefined" progress-hint="从上次发薪日到本次发薪日" @click="openPanel('settings')" />
          <CountdownRow :title="holiday ? `距离${holiday.name}` : '下个节假日'" :detail="holiday ? `${holiday.note}，休 ${holiday.length} 天` : '等待官方放假安排'" :value="holiday?.days ?? '—'" :progress="progress.holiday" :status="holiday?.ongoing ? '正在放假' : undefined" progress-hint="从上个假期结束到下个假期开始" @click="openPanel('holidays')" />
          <CountdownRow title="距离春节" :detail="spring ? `${formatDate(spring.date)} · 正月初一` : '春节历表待更新'" :value="spring?.days ?? '—'" :progress="progress.spring" :status="spring?.days === 0 ? '新春快乐' : undefined" progress-hint="从上个正月初一到下个正月初一" @click="openPanel('holidays')" />
        </div>
        <footer class="widget-footer"><span>{{ zoneLabel }}<span class="footer-dot">·</span>{{ dateLabel }}</span><button class="update-indicator" :title="calendarStatus.message" aria-label="查看日历数据与更新" @click="openPanel('settings')"><span :class="['status-dot', { offline: calendarStatus.failed, checking }]"></span>{{ checking ? '检查中' : '日历' }}</button></footer>
      </div>
      <div v-if="panel" ref="panelElement" class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <SettingsPanel v-if="panel === 'settings'" v-model="settings" :frosted="!macPreview" :native="native" :can-launch-at-login="canLaunchAtLogin" :material="material" :calendar-status="calendarStatus" :checking="checking" :app-update="appUpdate" @app-update-action="appUpdateAction" @check-updates="checkUpdates(true)" @close="closePanel" />
        <template v-else>
          <header class="panel-heading"><h2 id="panel-title">节假日安排</h2><button class="icon-button" aria-label="关闭假期列表" @click="closePanel"><AppIcon name="close" :size="16" /></button></header>
          <div class="panel-scroll"><p class="field-help">中国大陆官方放假安排，普通周末不作为节假日。</p><div v-for="item in upcoming" :key="item.start" class="holiday-list-item"><div><h3>{{ item.name }}</h3><p>{{ item.start.slice(0, 4) }}年 {{ formatDate(item.start) }}—{{ formatDate(item.end) }}</p></div><span>{{ daysBetween(item.start, item.end) + 1 }} 天</span></div><p v-if="!upcoming.length" class="field-help">尚无后续假期安排，请检查日历更新。</p><p class="field-help data-note">已载入 {{ yearRange }} 年放假安排。春节按大陆历表中的正月初一计算。</p></div>
          <button class="primary-button" @click="closePanel">完成</button>
        </template>
      </div>
      <div v-if="error" class="error-banner" role="alert">{{ error }}<button aria-label="关闭提示" @click="error = ''">×</button></div>
    </main>
    <footer v-if="!native" class="preview-footer"><span>{{ macPreview ? 'macOS 玻璃材质示意' : 'Windows 磨砂玻璃预览' }}<span> / </span><a :href="macPreview ? '/' : '/?preview=macos'">{{ macPreview ? '查看 Windows 预览' : '查看 macOS 示意' }}</a></span><span>{{ windowLayout.width }} × {{ glassHeight }} px</span></footer>
  </div>
</template>
