import Foundation

/// A conversation, read for its ANVIL state.
///
/// Hosts differ in everything except this: a list of turns, in order, some
/// written by the agent (which may ask with blocks) and some by humans (which
/// may answer with stamps). Owner chat, a meeting's chat, a support widget --
/// each hands its turns here and gets back the same answer.
///
/// Markdown is the host's business. The agent turn arrives as the SOURCES of
/// its ```anvil fences, already cut out by whatever markdown parser the host
/// renders with, so this never second-guesses what the host drew.
public struct AnvilTranscript: Sendable {
    public enum Turn: Sendable {
        /// An agent turn: the source of each ```anvil fence in it, in order.
        case agent(id: String, fences: [String])
        /// A human turn, as sent. `by` is the host's name for its author and
        /// `at` its time, each used when the stamp itself does not say.
        case human(id: String, text: String, by: String? = nil, at: Date? = nil)
    }

    /// How each block resolved. First in history order wins.
    public let ledger: AnvilLedger
    /// Every block id an agent turn asked, for knowing what is on screen.
    public let asked: Set<String>
    /// Per human turn that carried a stamp: what is left to draw.
    public let folds: [String: Fold]

    /// What a human turn with stamps in it renders as (SPEC 6.3).
    public struct Fold: Sendable, Equatable {
        /// The words around the stamps. Drawn as the turn.
        public let prose: String
        /// Stamps whose block is not in this transcript -- an answer to a
        /// question scrolled out of history. Folding those away would be
        /// "parsed and then not drawn", so their courtesy sentence stays.
        public let orphans: [AnvilStamp]

        /// A turn that is only stamps, all folded into blocks on screen.
        public var isHidden: Bool { prose.isEmpty && orphans.isEmpty }
    }

    public init(_ turns: [Turn]) {
        var ledger = AnvilLedger()
        var asked: Set<String> = []
        var stamped: [(turn: String, read: AnvilStampRead)] = []

        for turn in turns {
            switch turn {
            case let .agent(_, fences):
                for block in fences.flatMap({ AnvilParser.parse($0).blocks }).flatMap(Self.flatten) {
                    if block.kind == AnvilKind.void.rawValue {
                        // `@void id=<target>`: the id names the block it withdraws.
                        if !block.derivedId {
                            ledger.void(block.id, reason: block.attributes["reason"] ?? "Withdrawn")
                        }
                    } else if !block.isContainer {
                        asked.insert(block.id)
                    }
                }
            case let .human(id, text, by, at):
                let read = AnvilStamp.read(text)
                guard !read.stamps.isEmpty else { continue }
                for stamp in read.stamps { ledger.record(Self.attributed(stamp, by: by, at: at)) }
                stamped.append((id, read))
            }
        }

        self.ledger = ledger
        self.asked = asked
        folds = Dictionary(uniqueKeysWithValues: stamped.map { turn, read in
            (turn, Fold(prose: read.prose, orphans: read.stamps.filter { !asked.contains($0.block) }))
        })
    }

    /// A stamp that does not say who answered, or when, takes its turn's
    /// author and time. One that does keeps its own word: it was written at
    /// the moment of the answer, and the turn may have been delivered hours
    /// later, or by a relay.
    static func attributed(_ stamp: AnvilStamp, by author: String?, at time: Date?) -> AnvilStamp {
        var added: [AnvilStamp.Attribute] = []
        if stamp.at == nil, let time { added.append(.init("at", time.ISO8601Format())) }
        if stamp.by == nil, let author, !author.isEmpty { added.append(.init("by", author)) }
        guard !added.isEmpty else { return stamp }
        return AnvilStamp(
            block: stamp.block,
            kind: stamp.kind,
            attributes: stamp.attributes + added,
            children: stamp.children,
            body: stamp.body
        )
    }

    private static func flatten(_ block: AnvilDocument.Parsed) -> [AnvilDocument.Parsed] {
        [block] + block.children.flatMap(flatten)
    }
}
