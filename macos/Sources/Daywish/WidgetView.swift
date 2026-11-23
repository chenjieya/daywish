import SwiftUI
import AppKit
import DaywishCore

struct WidgetView: View {
    @ObservedObject var model: AppModel
    private let ink = Color(hex: 0x34434b)
    private let muted = Color(hex: 0x72818a)
    private let accent = Color(hex: 0x8099a8)
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.clear
            if model.panel == "settings" { PreferencesView(model: model) }
            else if model.panel == "holidays" { holidayPanel }
            else { dashboard }
            if !model.error.isEmpty {
                HStack(alignment: .top) { Text(model.error).font(.system(size: 10)); Spacer(); Button { model.error = "" } label: { Image(systemName: "xmark") }.accessibilityLabel("关闭提示") }.padding(10).background(Color.white).cornerRadius(8).padding(8)
            }
        }.foregroundColor(ink).tint(accent).buttonStyle(.plain)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .environment(\.colorScheme, .light)
            .onExitCommand { if model.panel != nil { model.panel = nil } else { model.hideWindow?() } }
    }
    private var dashboard: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                HStack(spacing: 7) { Image(systemName: "sun.horizon").font(.system(size: 15)); Text("好日将至").font(.system(size: 12, weight: .semibold)).tracking(1) }.frame(maxWidth: .infinity, alignment: .leading).overlay(DragHandle())
                icon(model.preferences.alwaysOnTop ? "pin.fill" : "pin", label: "始终置顶") { model.preferences.alwaysOnTop.toggle() }
                icon("gearshape", label: "设置") { model.panel = "settings" }.keyboardShortcut(",", modifiers: .command)
                icon("xmark", label: "收起到菜单栏") { model.flush(); model.hideWindow?() }
            }.frame(height: 23)
            VStack(spacing: model.preferences.compact ? 10 : 15) {
                Button { model.panel = "settings" } label: {
                    row(title: "距离发薪", detail: model.payday.map { DateEngine.shortDate($0.date) } ?? "", days: model.payday?.days, progress: model.engine.paydayProgress(today: model.today, preferences: model.preferences), status: model.payday?.days == 0 ? "今天发薪" : nil, hint: "从上次发薪日到本次发薪日")
                }
                Button { model.panel = "holidays" } label: {
                    row(title: model.holiday.map { "距离\($0.holiday.name)" } ?? "下个节假日", detail: model.holiday.map { DateEngine.shortDate($0.holiday.start) } ?? "", days: model.holiday?.days, progress: model.engine.holidayProgress(today: model.today), status: model.holiday?.ongoing == true ? "正在放假" : nil, hint: "从上个假期结束到下个假期开始")
                }
                Button { model.panel = "holidays" } label: {
                    row(title: "距离春节", detail: model.spring.map { DateEngine.shortDate($0.date) } ?? "", days: model.spring?.days, progress: model.engine.springProgress(today: model.today), status: model.spring?.days == 0 ? "新春快乐" : nil, hint: "从上个正月初一到下个正月初一")
                }
            }.padding(.top, model.preferences.compact ? 11 : 17)
            Spacer(minLength: 3)
            HStack {
                Text("\(model.preferences.timeZone == .beijing ? "北京时间" : "系统时区") · \(model.dateLabel)")
                Spacer()
                Button { model.panel = "settings" } label: { HStack(spacing: 4) { Circle().fill(Color(hex: 0x829a8b)).frame(width: 4, height: 4); Text(model.checkingCalendar ? "检查中" : "日历") } }.help(model.calendarMessage)
            }.font(.system(size: 9)).foregroundColor(muted).frame(height: 16)
        }.padding(.horizontal, 18).padding(.top, model.preferences.compact ? 12 : 15).padding(.bottom, model.preferences.compact ? 9 : 12)
    }
    private func row(title: String, detail: String, days: Int?, progress: Double?, status: String?, hint: String) -> some View {
        VStack(spacing: model.preferences.compact ? 5 : 7) {
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(title).font(.system(size: 12, weight: .medium))
                if !model.preferences.compact { Text(detail).font(.system(size: 10)).foregroundColor(muted) }
                Spacer(minLength: 5)
                if let status { Text(status).font(.system(size: 11)).foregroundColor(Color(hex: 0x526e60)) }
                else { HStack(alignment: .firstTextBaseline, spacing: 3) { Text("还有").font(.system(size: 10)).foregroundColor(muted); Text(days.map(String.init) ?? "—").font(.system(size: 16, weight: .semibold)).monospacedDigit(); Text("天").font(.system(size: 10)).foregroundColor(muted) } }
            }
            HStack(spacing: 8) {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) { Capsule().fill(accent.opacity(0.14)); Capsule().fill(LinearGradient(colors: [accent, Color(hex: 0xa1b5c0)], startPoint: .leading, endPoint: .trailing)).frame(width: geometry.size.width * CGFloat((progress ?? 0) / 100)) }
                }.frame(height: model.preferences.compact ? 5 : 7).accessibilityElement(children: .ignore).accessibilityLabel(hint).accessibilityValue(progress.map { "已过 \(Int($0.rounded()))%" } ?? "缺少上一周期数据")
                Text(progress.map { "\(Int($0.rounded()))%" } ?? "—").font(.system(size: 9)).monospacedDigit().foregroundColor(muted).frame(width: 28, alignment: .trailing)
            }
        }.contentShape(Rectangle()).help(hint)
    }
    private func icon(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol).font(.system(size: 12)).foregroundColor(muted).frame(width: 22, height: 23).contentShape(Rectangle()) }.accessibilityLabel(label).help(label)
    }
    private var holidayPanel: some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack { Text("节假日安排").font(.system(size: 14, weight: .semibold)); Spacer(); icon("xmark", label: "关闭假期列表") { model.panel = nil } }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("中国大陆官方放假安排，普通周末不作为节假日。").font(.system(size: 10)).foregroundColor(muted)
                    ForEach(Array(model.engine.data.holidays.filter { $0.end >= model.today }.prefix(7))) { holiday in
                        HStack { VStack(alignment: .leading, spacing: 5) { Text(holiday.name).font(.system(size: 12)); Text("\(holiday.start.prefix(4))年 \(DateEngine.shortDate(holiday.start))—\(DateEngine.shortDate(holiday.end))").font(.system(size: 9)).foregroundColor(muted) }; Spacer(); Text("\(model.engine.days(holiday.start, holiday.end) + 1) 天").font(.system(size: 10)).foregroundColor(muted) }
                        Divider()
                    }
                    Text("春节使用中国科学院紫金山天文台与大陆政务公开资料，按正月初一计算。").font(.system(size: 9)).foregroundColor(muted).lineSpacing(4)
                }
            }
            Button { model.panel = nil } label: { Text("完成").font(.system(size: 11)).frame(maxWidth: .infinity).padding(9).background(accent).foregroundColor(.white).cornerRadius(8) }
        }.padding(18).background(Color.white.opacity(model.preferences.opacity / 100 * 0.18))
    }
}
