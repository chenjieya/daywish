export type ViewMode = 'dashboard' | 'compact' | 'panel'

/** 网页内容和原生客户区共用尺寸，避免设置视图与窗口高度各自维护。 */
// 系统绘制 Acrylic、圆角和阴影，客户区无需再为透明阴影预留间距。
export const windowLayout = { width: 340, dashboard: 236, compact: 204, panel: 490, inset: 0 } as const

export function isViewMode(value: unknown): value is ViewMode {
  return value === 'dashboard' || value === 'compact' || value === 'panel'
}
export function viewMode(panelOpen: boolean, compact: boolean): ViewMode {
  return panelOpen ? 'panel' : compact ? 'compact' : 'dashboard'
}
export function clientSize(mode: ViewMode): { width: number; height: number } {
  return { width: windowLayout.width + windowLayout.inset * 2, height: windowLayout[mode] + windowLayout.inset * 2 }
}
