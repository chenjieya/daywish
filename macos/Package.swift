// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Daywish",
    platforms: [.macOS("26.0")],
    products: [.executable(name: "Daywish", targets: ["Daywish"])],
    dependencies: [.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.1")],
    targets: [
        .target(name: "DaywishCore", resources: [.copy("Resources/calendar.json"), .copy("Resources/springs.json"), .copy("Resources/date-cases.json")]),
        .executableTarget(name: "Daywish", dependencies: ["DaywishCore", .product(name: "Sparkle", package: "Sparkle")], linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]),
        .testTarget(name: "DaywishCoreTests", dependencies: ["DaywishCore"])
    ]
)
