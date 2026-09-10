import Foundation

/// The conformance corpus, read straight off disk.
///
/// `packages/conformance/corpus.json` is the artefact and it has no TypeScript
/// in it -- the README is explicit that any implementation in any language
/// reads the same file and runs the same assertions. So this reads it rather
/// than vendoring a copy: a vendored corpus is a corpus that can be stale, and
/// a stale oracle is worse than no oracle.
///
/// It is located from `#filePath` rather than bundled as a resource because a
/// SwiftPM resource must live inside its own target directory, and the corpus
/// lives two packages over. Tests only ever run from inside this repo, so the
/// path is always there.
enum Corpus {
    struct Case: Sendable, Codable {
        let id: String
        let spec: String
        let title: String
        let source: String
        let expect: Expectation
    }

    /// Only the keys the README calls "about the document model". The `html*`
    /// keys name substrings of the reference renderer's output and are not a
    /// parser's business.
    struct Expectation: Sendable, Codable {
        var blocks: [BlockExpectation]?
        var topLevelKinds: [String]?
        var maxDepth: Int?
        var warnings: [String]?
        var warningsContain: [String]?
    }

    struct BlockExpectation: Sendable, Codable {
        var kind: String?
        var id: String?
        var derivedId: Bool?
        var prompt: String?
        var subtext: String?
        var optionValues: [String]?
        var optionLabels: [String]?
        var taskStates: [String]?
        var taskRefs: [String]?
        var taskLabels: [String]?
        var dataLabels: [String]?
        var dataValues: [Double]?
        var nodeIds: [String]?
        var edges: [String]?
    }

    static let repositoryRoot: URL = {
        // packages/swift/Tests/AnvilKitTests/Corpus.swift -> repo root
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // AnvilKitTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // swift
            .deletingLastPathComponent() // packages
            .deletingLastPathComponent() // root
    }()

    static let cases: [Case] = {
        let url = repositoryRoot.appendingPathComponent("packages/conformance/corpus.json")
        guard let data = try? Data(contentsOf: url) else { return [] }
        // `version` is a NUMBER in corpus.json, not a string. It is not read
        // here, so it is simply not declared -- decoding it as the wrong type
        // silently produced zero cases, and a parameterised test with zero
        // arguments is a green test that proves nothing. That is what
        // `corpusIsPresent` exists to catch.
        struct File: Codable { let cases: [Case] }
        return (try? JSONDecoder().decode(File.self, from: data))?.cases ?? []
    }()

    /// The cases that pin the block model. The rest pin `warnings`, `tree` or
    /// renderer output and are asserted elsewhere or not at all.
    static let casesWithBlocks: [Case] = cases.filter { $0.expect.blocks != nil }

    /// The cases that require a specific warning to be reported.
    static let casesWithWarnings: [Case] = cases.filter {
        !($0.expect.warningsContain ?? []).isEmpty
    }

    /// Every prefix of a source, which the corpus requires the parser to
    /// survive. A fence arrives from a model token by token, so a prefix is a
    /// real input, not a synthetic one.
    static func prefixes(of source: String) -> [String] {
        let characters = Array(source)
        return (0 ... characters.count).map { String(characters[0 ..< $0]) }
    }
}
