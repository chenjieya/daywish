import AppKit
import SwiftUI
import DaywishCore

extension Color {
    init(hex: UInt32) { self.init(.sRGB, red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255, opacity: 1) }
}
struct Palette {
    let ink: Color
    let muted: Color
    let surface: Color
    let accent: Color
    let spring: Color
    let sun: Color
    init(_ theme: Theme) {
        switch theme {
        case .dawn: ink = Color(hex: 0x314e47); muted = Color(hex: 0x68796f); surface = Color(hex: 0xf0f4e6); accent = Color(hex: 0x4f7668); spring = Color(hex: 0xba825b); sun = Color(hex: 0xedbd75)
        case .forest: ink = Color(hex: 0xe3ede6); muted = Color(hex: 0xafc9bd); surface = Color(hex: 0x25453c); accent = Color(hex: 0xb0d3bd); spring = Color(hex: 0xe2be98); sun = Color(hex: 0xcecf96)
        case .night: ink = Color(hex: 0xece8ee); muted = Color(hex: 0xb4b1c7); surface = Color(hex: 0x2f2d45); accent = Color(hex: 0xcebedc); spring = Color(hex: 0xe0b4c2); sun = Color(hex: 0xddd0aa)
        }
    }
    var line: Color { ink.opacity(0.13) }
}
struct DragHandle: NSViewRepresentable {
    final class View: NSView { override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) } }
    func makeNSView(context: Context) -> View { View() }
    func updateNSView(_ nsView: View, context: Context) {}
}
struct Horizon: View {
    let color: Color
    var body: some View {
        ZStack {
            Circle().trim(from: 0.5, to: 1).stroke(color.opacity(0.2), lineWidth: 1).frame(width: 88, height: 88)
            Circle().fill(LinearGradient(colors: [color, color.opacity(0.3)], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: 54, height: 54).mask(Rectangle().frame(height: 27).offset(y: -13.5))
            VStack(spacing: 8) { Rectangle().fill(color.opacity(0.7)).frame(width: 92, height: 1); Rectangle().fill(color.opacity(0.4)).frame(width: 42, height: 1); Rectangle().fill(color.opacity(0.25)).frame(width: 34, height: 1) }.offset(y: 9)
        }.frame(width: 110, height: 110).accessibilityHidden(true)
    }
}
