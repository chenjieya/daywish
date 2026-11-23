// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Daywish",
    platforms: [.macOS("26.0")],
    products: [.executable(name: "Daywish", targets: ["Daywish"])],
    targets: [
        .target(name: "DaywishCore", resources: [.copy("Resources/calendar.json"), .copy("Resources/springs.json"), .copy("Resources/date-cases.json")]),
        .executableTarget(name: "Daywish", dependencies: ["DaywishCore"]),
        .testTarget(name: "DaywishCoreTests", dependencies: ["DaywishCore"])
    ]
)
