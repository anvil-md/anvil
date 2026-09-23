import Foundation
import Testing

@testable import AnvilKit

/// A conversation read for its ANVIL state: SPEC 7.1's laws over a real
/// sequence of turns.
@Suite("State from the transcript")
struct TranscriptTests {
    static let ask = """
    @choice id=deploy
    ? Where?
    - prod  | Production
    - stage | Staging
    """

    static func stamp(_ value: String, at: String? = nil, by: String? = nil) -> String {
        var attributes = "block=\"deploy\" kind=\"choice\" value=\"\(value)\" label=\"\(value)\""
        if let at { attributes += " at=\"\(at)\"" }
        if let by { attributes += " by=\"\(by)\"" }
        return "<stamp \(attributes)>I picked \(value).</stamp>"
    }

    @Test("the first stamp in history order decides the block")
    func firstWins() throws {
        let transcript = AnvilTranscript([
            .agent(id: "1", fences: [Self.ask]),
            .human(id: "2", text: Self.stamp("stage")),
            .human(id: "3", text: Self.stamp("prod")),
        ])
        let entry = try #require(transcript.ledger["deploy"])
        #expect(entry.stamp?.picked == ["stage"])
    }

    @Test("a later stamp for the same block is kept, in order, and decides nothing")
    func laterIsKeptButInert() throws {
        let transcript = AnvilTranscript([
            .agent(id: "1", fences: [Self.ask]),
            .human(id: "2", text: Self.stamp("stage")),
            .human(id: "3", text: Self.stamp("prod", by: "Marcus")),
            .human(id: "4", text: Self.stamp("stage", by: "Lisa")),
        ])
        let entry = try #require(transcript.ledger["deploy"])
        #expect(entry.stamp?.picked == ["stage"])
        #expect(entry.refused.map(\.picked) == [["prod"], ["stage"]])
        #expect(entry.refused.map(\.by) == ["Marcus", "Lisa"])
    }

    @Test("by= and at= are carried; a stamp without them takes its turn's author and time")
    func byAndAt() throws {
        let first = AnvilTranscript([
            .agent(id: "1", fences: [Self.ask]),
            .human(id: "2", text: Self.stamp("prod", at: "2026-09-23T07:02:11Z", by: "Ana"), by: "relay-bot"),
        ])
        let stamp = try #require(first.ledger["deploy"]?.stamp)
        #expect(stamp.by == "Ana", "the stamp's own by= was overwritten by the turn's author")
        #expect(stamp.at == "2026-09-23T07:02:11Z")
        #expect(stamp.date != nil)

        let delivered = try Date("2026-09-23T09:30:00Z", strategy: .iso8601)
        let second = AnvilTranscript([.human(id: "2", text: Self.stamp("prod"), by: "Marcus", at: delivered)])
        #expect(second.ledger["deploy"]?.stamp?.by == "Marcus")
        #expect(second.ledger["deploy"]?.stamp?.date == delivered)

        let own = AnvilTranscript([
            .human(id: "2", text: Self.stamp("prod", at: "2026-09-23T07:02:11Z"), at: delivered),
        ])
        #expect(own.ledger["deploy"]?.stamp?.at == "2026-09-23T07:02:11Z", "delivery time overwrote the answer's")
    }

    @Test("a stamp in an AGENT turn stamps nothing: the client writes stamps, never the agent")
    func agentCannotStamp() {
        let transcript = AnvilTranscript([
            .agent(id: "1", fences: [Self.ask + "\n> " + Self.stamp("prod")]),
        ])
        #expect(transcript.ledger["deploy"] == nil)
    }

    @Test("a turn that is only stamps folds away; prose around a stamp stays")
    func folding() throws {
        let transcript = AnvilTranscript([
            .agent(id: "1", fences: [Self.ask]),
            .human(id: "only", text: Self.stamp("prod")),
            .human(id: "mixed", text: "Staging first.\n" + Self.stamp("stage")),
            .human(id: "plain", text: "no stamps here"),
        ])
        #expect(try #require(transcript.folds["only"]).isHidden)
        #expect(try #require(transcript.folds["mixed"]).prose == "Staging first.")
        #expect(transcript.folds["plain"] == nil)
    }

    @Test("a stamp whose block is not in the transcript is not folded away")
    func orphanStays() throws {
        let transcript = AnvilTranscript([.human(id: "h", text: Self.stamp("prod"))])
        let fold = try #require(transcript.folds["h"])
        #expect(!fold.isHidden)
        #expect(fold.orphans.map(\.block) == ["deploy"])
    }

    @Test("@void withdraws an open block, and a stamp after it is refused")
    func voidIsAbsorbing() throws {
        let transcript = AnvilTranscript([
            .agent(id: "1", fences: [Self.ask]),
            .agent(id: "2", fences: ["@void id=deploy reason=\"you said it in words\""]),
            .human(id: "3", text: Self.stamp("prod")),
        ])
        let entry = try #require(transcript.ledger["deploy"])
        #expect(entry.resolution == .void(reason: "you said it in words"))
        #expect(entry.refused.count == 1)
    }

    @Test("@void after a stamp changes nothing")
    func voidAfterStamp() throws {
        let transcript = AnvilTranscript([
            .agent(id: "1", fences: [Self.ask]),
            .human(id: "2", text: Self.stamp("prod")),
            .agent(id: "3", fences: ["@void id=deploy reason=late"]),
        ])
        #expect(transcript.ledger["deploy"]?.stamp?.picked == ["prod"])
    }

    @Test("blocks inside a layout are asked too")
    func nestedBlocksAreAsked() {
        let transcript = AnvilTranscript([
            .agent(id: "1", fences: ["@grid cols=2\n" + Self.ask + "\n@end"]),
        ])
        #expect(transcript.asked.contains("deploy"))
    }
}
