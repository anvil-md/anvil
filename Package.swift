// swift-tools-version: 6.2
import PackageDescription

// AnvilKit -- the ANVIL block language in Swift.
//
// WHY THIS FILE IS AT THE REPOSITORY ROOT, in a TypeScript monorepo:
// SwiftPM resolves a git dependency by cloning the repo and reading
// `Package.swift` AT THE ROOT. There is no way to point a dependency at a
// subdirectory -- no `path` component in the URL form, no subpath option. So a
// Swift package inside a polyglot repo either lives at the root or lives in a
// separate repo.
//
// It lives here because the CORPUS IS THE ORACLE. `packages/conformance/
// corpus.json` decides whether this implementation is correct, and a separate
// repo would let the two drift: a corpus case added on Monday and a Swift
// parser that has never seen it is exactly the failure the corpus exists to
// prevent. One repo, one commit, one truth.
//
// The sources themselves sit under `packages/swift/`, matching the layout every
// other implementation in this repo uses.
let package = Package(
    name: "AnvilKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AnvilKit", targets: ["AnvilKit"]),
    ],
    targets: [
        // Foundation only. No SwiftUI, no UIKit, no AppKit -- a parser has no
        // business knowing what a pixel is, and a host on a platform without
        // SwiftUI should still be able to read a fence.
        .target(
            name: "AnvilKit",
            path: "packages/swift/Sources/AnvilKit",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "AnvilKitTests",
            dependencies: ["AnvilKit"],
            path: "packages/swift/Tests/AnvilKitTests",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
