import { onMounted, onUnmounted, ref } from 'vue'
import { version } from '../../package.json'
import type { AppUpdateAction, AppUpdateState } from '../types/app-update'

export function useAppUpdates(beforeInstall: () => Promise<void>) {
  const state = ref<AppUpdateState>({ phase: 'disabled', currentVersion: version, notes: [], percent: 0, message: '网页仅预览，软件更新在安装版中使用' })
  let unsubscribe: (() => void) | undefined
  let disposed = false
  let revision = 0
  onMounted(async () => {
    if (!window.daywish) return
    unsubscribe = window.daywish.onAppUpdate(value => { revision++; state.value = value })
    const initial = revision
    try {
      const value = await window.daywish.readAppUpdate()
      if (!disposed && initial === revision) state.value = value
    } catch { if (!disposed) state.value = { ...state.value, phase: 'error', message: '暂时无法读取软件更新状态，请重新打开应用' } }
  })
  onUnmounted(() => { disposed = true; unsubscribe?.() })
  async function action(action: AppUpdateAction): Promise<void> {
    if (!window.daywish || disposed) return
    try {
      if (action === 'install') await beforeInstall()
      // 状态由主进程事件更新；异步返回值可能落后于新事件，不能覆盖它。
      await window.daywish.appUpdateAction(action)
    } catch { if (!disposed) state.value = { ...state.value, phase: 'error', message: '软件更新操作未完成，请稍后重试' } }
  }
  return { appUpdate: state, appUpdateAction: action }
}
