import SwiftUI
import DaywishCore

struct PreferencesView: View {
    @ObservedObject var model: AppModel
    private let accent = Color(hex: 0x7e99a9)
    private let muted = Color(hex: 0x72818a)
    var body: some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack { Text("小窗设置").font(.system(size: 14, weight: .semibold)); Spacer(); Button { model.panel = nil } label: { Image(systemName: "xmark").font(.system(size: 12)).frame(width: 22, height: 23) }.accessibilityLabel("关闭设置") }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    heading("发薪日")
                    Picker("每月发薪", selection: $model.preferences.payday) { ForEach(1...31, id: \.self) { Text("\($0) 日").tag($0) }; Text("最后一天").tag(0) }
                    Picker("遇到休息日", selection: $model.preferences.paydayRule) { Text("按约定日期").tag(PaydayRule.exact); Text("提前至工作日").tag(PaydayRule.previous); Text("顺延至工作日").tag(PaydayRule.next) }
                    note("短月份取月末，工作日包含官方补班安排。")
                    Divider()
                    heading("外观与窗口")
                    HStack { Text("白色衬底"); Spacer(); Text("\(Int(model.preferences.opacity))%").monospacedDigit() }
                    Slider(value: $model.preferences.opacity, in: 0...95, step: 1).accessibilityLabel("白色衬底")
                    note("0% 不叠加白底。需要提高文字对比度时可调高；折射与高光由系统处理。")
                    Toggle("始终置顶", isOn: $model.preferences.alwaysOnTop)
                    Toggle("更紧凑的间距", isOn: $model.preferences.compact)
                    Toggle("开机启动", isOn: Binding(get: { model.preferences.launchAtLogin }, set: model.setLaunchAtLogin))
                    Divider()
                    heading("时间与日历")
                    Picker("日期使用", selection: $model.preferences.timeZone) { Text("北京时间").tag(TimeZoneMode.beijing); Text("跟随系统时区").tag(TimeZoneMode.system) }
                    Toggle("自动更新日历", isOn: $model.preferences.autoUpdate)
                    note("每年检查；9 月起若次年安排未公布，每周重试。仅更新数据，不重装软件。")
                    HStack(alignment: .top) { Text(model.calendarMessage).font(.system(size: 9)).foregroundColor(muted); Spacer(minLength: 8); Button(model.checkingCalendar ? "正在检查…" : "立即检查") { model.checkUpdates(force: true) }.font(.system(size: 10)).disabled(model.checkingCalendar) }.padding(9).background(accent.opacity(0.08)).cornerRadius(7)
                    note("放假安排以国务院通知为准。春节使用大陆历表。联网失败继续使用本地日历，不上传个人设置。")
                }.font(.system(size: 11)).toggleStyle(.switch).controlSize(.small)
            }
            Button { model.flush(); model.panel = nil } label: { Text("完成").font(.system(size: 11)).frame(maxWidth: .infinity).padding(9).background(accent).foregroundColor(.white).cornerRadius(8) }.keyboardShortcut(.defaultAction)
        }.padding(18).background(Color.white.opacity(model.preferences.opacity / 100 * 0.18)).tint(accent)
    }
    private func heading(_ value: String) -> some View { Text(value).font(.system(size: 10)).foregroundColor(muted) }
    private func note(_ value: String) -> some View { Text(value).font(.system(size: 9)).foregroundColor(muted).lineSpacing(4).fixedSize(horizontal: false, vertical: true) }
}
