import AppKit
import Combine
import Sparkle
import SwiftUI

/// Sparkle 独立保存软件更新偏好，与日历自动更新开关无关。
@MainActor
final class SoftwareUpdater: ObservableObject {
    private let controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: nil, userDriverDelegate: nil)
    @Published private(set) var canCheck = false
    @Published private(set) var automatic = true
    @Published private(set) var message = "发现新版本后，由你确认下载并重启更新。"
    var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "开发版" }
    init() {
        controller.updater.publisher(for: \.canCheckForUpdates).assign(to: &$canCheck)
        controller.updater.publisher(for: \.automaticallyChecksForUpdates).assign(to: &$automatic)
    }
    func start() {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String, Data(base64Encoded: key)?.count == 32 else {
            message = "更新公钥未配置，请使用完整发布版。"
            return
        }
        // CI 验证真实更新器初始化，避免首次发布前请求尚不存在的更新源。
        if ProcessInfo.processInfo.environment["DAYWISH_SMOKE_TEST"] == "1" { controller.updater.automaticallyChecksForUpdates = false }
        controller.startUpdater()
    }
    func setAutomatic(_ enabled: Bool) { controller.updater.automaticallyChecksForUpdates = enabled }
    func check() {
        guard canCheck else { return }
        NSApp.activate(ignoringOtherApps: true)
        controller.checkForUpdates(nil)
    }
}

struct SoftwareUpdateSettings: View {
    @ObservedObject var updater: SoftwareUpdater
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("软件更新 · v\(updater.version)").font(.system(size: 10)).foregroundStyle(.secondary)
            Toggle("自动检查新版本", isOn: Binding(get: { updater.automatic }, set: updater.setAutomatic))
            HStack(alignment: .top) {
                Text(updater.message).font(.system(size: 9)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button("检查新版本") { updater.check() }.disabled(!updater.canCheck).font(.system(size: 10))
            }.padding(9).background(Color(hex: 0x7e99a9).opacity(0.08)).cornerRadius(7)
            Text("每天自动检查一次。更新会保留工资日、外观与窗口位置。").font(.system(size: 9)).foregroundStyle(.secondary)
        }
    }
}
