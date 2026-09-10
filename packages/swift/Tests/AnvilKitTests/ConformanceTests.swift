import Foundation
import Testing

@testable import AnvilKit

/// The Swift implementation, held to the corpus.
///
/// The corpus tests the LANGUAGE, not this codebase, so a failure here names a
/// section of SPEC.md rather than a line of Swift.
///
/// Every case gets three things whether it declares them or not:
///   1. the declared expectations;
///   2. no throw on the source;
///   3. no throw on EVERY PREFIX of the source.
///
/// (3) is the one that matters most for a Swift port and is also the one it
/// gets closest to for free: `AnvilParser.parse` has no throwing path at all,
/// which is the totality rule from CLAUDE.md enforced by the type system rather
/// than by discipline.
@Suite("ANVIL conformance")
struct ConformanceTests {
    @Test("the corpus loaded, so a zero-case pass is impossible")
    func corpusIsPresent() {
        #expect(Corpus.cases.count == 77, "found \(Corpus.cases.count) cases at \(Corpus.repositoryRoot.path)")
    }

    /// Prints the score. A conformance suite that can be filtered without
    /// saying so is a conformance suite that can be gamed.
    @Test("how much of the corpus this implementation is actually held to")
    func documentModelCoverageIsVisible() {
        let total = Corpus.cases.count
        let withBlocks = Corpus.casesWithBlocks.count
        let kinds = Set(Corpus.cases.compactMap { $0.expect.blocks?.first?.kind }).sorted()
        print("""
        corpus: \(total) cases
          \(withBlocks) pin the block model and are asserted here
          \(total - withBlocks) pin warnings/tree/html only and are not
          kinds present: \(kinds.joined(separator: " "))
        """)
        #expect(withBlocks > 0)
    }

    /// Totality. This should pass TODAY, across every case, even where the
    /// parser does not yet understand the block -- because not understanding
    /// something is not permission to crash on it.
    @Test("the parser survives every prefix of every case", arguments: Corpus.cases)
    func isTotal(_ testCase: Corpus.Case) {
        for prefix in Corpus.prefixes(of: testCase.source) {
            let document = AnvilParser.parse(prefix)
            // Reaching here at all is the assertion: parse cannot throw, so the
            // failure mode being guarded against is a crash, not an error.
            _ = document.blocks.count
        }
    }

    /// The document model. This is the real bar and it is NOT met yet.
    /// A case that pins `warnings` or `tree` and nothing else is not this
    /// test's business, so those are filtered out of the arguments rather than
    /// failed. `documentModelCoverageIsVisible` prints how many that leaves, so
    /// the filtering cannot quietly shrink the suite.
    @Test("the parsed blocks match the corpus", arguments: Corpus.casesWithBlocks)
    func matchesDocumentModel(_ testCase: Corpus.Case) throws {
        let expected = try #require(testCase.expect.blocks)
        let actual = AnvilParser.parse(testCase.source).blocks

        #expect(
            actual.count == expected.count,
            "\(testCase.id) (SPEC \(testCase.spec)): parsed \(actual.count) blocks, corpus expects \(expected.count)"
        )

        for (index, want) in expected.enumerated() {
            guard index < actual.count else { break }
            let got = actual[index]

            if let kind = want.kind {
                #expect(got.kind == kind, "\(testCase.id): block \(index) kind")
            }
            if let id = want.id {
                #expect(got.id == id, "\(testCase.id): block \(index) id")
            }
            if let prompt = want.prompt {
                #expect(got.prompt == prompt, "\(testCase.id): block \(index) prompt")
            }
            if let subtext = want.subtext {
                #expect(got.subtext == subtext, "\(testCase.id): block \(index) subtext")
            }
            if let values = want.optionValues {
                #expect(got.options.map(\.id) == values, "\(testCase.id): block \(index) optionValues")
            }
            if let labels = want.optionLabels {
                #expect(got.options.map(\.title) == labels, "\(testCase.id): block \(index) optionLabels")
            }
            if let labels = want.dataLabels {
                #expect(got.data.map(\.label) == labels, "\(testCase.id): block \(index) dataLabels")
            }
            if let values = want.dataValues {
                #expect(got.data.map(\.value) == values, "\(testCase.id): block \(index) dataValues")
            }
            if let raw = want.dataRaw {
                #expect(got.data.map(\.raw) == raw, "\(testCase.id): block \(index) dataRaw")
            }
            if let domain = want.domain {
                let got = try #require(got.domain, "\(testCase.id): block \(index) has no domain")
                if let floor = domain.floor { #expect(got.floor == floor, "\(testCase.id): domain floor") }
                if let top = domain.top { #expect(got.top == top, "\(testCase.id): domain top") }
                if let authored = domain.authoredTop {
                    #expect(got.authoredTop == authored, "\(testCase.id): domain authoredTop")
                }
                if let authored = domain.authoredFloor {
                    #expect(got.authoredFloor == authored, "\(testCase.id): domain authoredFloor")
                }
            }
        }
    }

    /// `warningsContain` names a substring the spec requires to be reported.
    ///
    /// CLAUDE.md rule 3 makes warnings the error channel, not diagnostics: the
    /// parser never throws, so a warning is the ONLY way a malformed fence can
    /// announce itself. A missing warning is therefore a swallowed error.
    @Test("required warnings are reported", arguments: Corpus.casesWithWarnings)
    func reportsWarnings(_ testCase: Corpus.Case) throws {
        let required = try #require(testCase.expect.warningsContain)
        let produced = AnvilParser.parse(testCase.source).warnings.map(\.message)

        for substring in required {
            #expect(
                produced.contains { $0.localizedCaseInsensitiveContains(substring) },
                """
                \(testCase.id) (SPEC \(testCase.spec)): no warning contains "\(substring)"
                produced: \(produced.isEmpty ? "none" : produced.joined(separator: " / "))
                """
            )
        }
    }
}

extension Corpus.Case: CustomTestStringConvertible {
    var testDescription: String { "\(id) (§\(spec))" }
}
