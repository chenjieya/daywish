<script setup lang="ts">
import type { Settings } from '../types/settings'
import type { UpdateStatus } from '../types/calendar'
import AppIcon from './AppIcon.vue'
defineProps<{ modelValue: Settings; frosted: boolean; native: boolean; canLaunchAtLogin: boolean; material: string; calendarStatus: UpdateStatus; checking: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: Settings]; close: []; 'check-updates': [] }>()
function update<K extends keyof Settings>(settings: Settings, key: K, value: Settings[K]) { emit('update:modelValue', { ...settings, [key]: value }) }
</script>
<template>
  <header class="panel-heading"><h2 id="panel-title">小窗设置</h2><button class="icon-button" aria-label="关闭设置" @click="emit('close')"><AppIcon name="close" :size="16" /></button></header>
  <div class="panel-scroll">
    <section class="settings-section"><h3>发薪日</h3>
      <label class="field"><span>每月发薪</span><select :value="modelValue.payday" @change="update(modelValue, 'payday', Number(($event.target as HTMLSelectElement).value))"><option v-for="day in 31" :key="day" :value="day">{{ day }} 日</option><option :value="0">最后一天</option></select></label>
      <label class="field"><span>遇到休息日</span><select :value="modelValue.paydayRule" @change="update(modelValue, 'paydayRule', ($event.target as HTMLSelectElement).value as Settings['paydayRule'])"><option value="exact">按约定日期</option><option value="previous">提前至工作日</option><option value="next">顺延至工作日</option></select></label>
      <p class="field-help">短月份取月末，工作日包含官方补班安排。</p>
    </section>
    <section class="settings-section"><h3>外观与窗口</h3>
      <template v-if="frosted">
        <label class="field" for="settings-frost"><span>磨砂浓度</span><output>{{ modelValue.frostOpacity }}%</output></label>
        <input id="settings-frost" class="range" type="range" min="70" max="96" :value="modelValue.frostOpacity" @input="update(modelValue, 'frostOpacity', Number(($event.target as HTMLInputElement).value))" />
        <p class="field-help">调低更通透，调高更清晰。始终保留浅色底，文字不随浓度变淡。</p>
      </template>
      <template v-else>
        <label class="field" for="settings-opacity"><span>白色衬底</span><output>{{ modelValue.opacity }}%</output></label>
        <input id="settings-opacity" class="range" type="range" min="0" max="95" :value="modelValue.opacity" @input="update(modelValue, 'opacity', Number(($event.target as HTMLInputElement).value))" />
        <p class="field-help">0% 不叠加白底。需要提高文字对比度时可调高，文字始终保持清晰。</p>
      </template>
      <label class="field"><span>始终置顶</span><input type="checkbox" role="switch" :checked="modelValue.alwaysOnTop" @change="update(modelValue, 'alwaysOnTop', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="field"><span>更紧凑的间距</span><input type="checkbox" role="switch" :checked="modelValue.compact" @change="update(modelValue, 'compact', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="field"><span>开机启动</span><input type="checkbox" role="switch" :disabled="!canLaunchAtLogin" :checked="modelValue.launchAtLogin" @change="update(modelValue, 'launchAtLogin', ($event.target as HTMLInputElement).checked)" /></label>
      <p v-if="!native" class="field-help">网页审核模式。桌面拖动、置顶与开机启动在桌面版生效。</p>
    </section>
    <section class="settings-section"><h3>时间与日历</h3>
      <label class="field"><span>日期使用</span><select :value="modelValue.timeZone" @change="update(modelValue, 'timeZone', ($event.target as HTMLSelectElement).value as Settings['timeZone'])"><option value="beijing">北京时间</option><option value="system">跟随系统时区</option></select></label>
      <label class="field"><span>自动更新日历</span><input type="checkbox" role="switch" :checked="modelValue.autoUpdate" @change="update(modelValue, 'autoUpdate', ($event.target as HTMLInputElement).checked)" /></label>
      <p class="field-help">每年检查；9 月起若次年安排未公布，每周重试。仅更新数据，不重装软件。</p>
      <div class="update-box"><p role="status">{{ calendarStatus.message }}</p><button class="text-button" :disabled="checking" @click="emit('check-updates')">{{ checking ? '正在检查…' : '立即检查' }}</button></div>
      <p class="field-help">放假安排以国务院通知为准。春节使用紫金山天文台和大陆政务公开资料。联网失败继续使用本地日历。</p>
    </section>
  </div>
  <button class="primary-button" @click="emit('close')">完成</button>
</template>
