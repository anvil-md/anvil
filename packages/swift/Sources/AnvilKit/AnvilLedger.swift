import Foundation

/// How every block in a conversation resolved, read from the record in order.
///
/// SPEC 7.1, the laws this enforces:
///
/// - **I.** A stamp is forever. Nothing here can remove one.
/// - **III.** One stamp per block id. The second is REFUSED, not queued and
///   not overwritten -- but it is not thrown away either. It happened, it is
///   in the transcript, so it is kept in `refused` and a renderer can say so.
///
/// And SPEC 7.2: stamped and void are absorbing. A `@void` after a stamp
/// changes nothing; a stamp after a `@void` is refused.
///
/// The FIRST event in history order wins. That is the whole rule, and it is
/// why this is a fold over an ordered sequence rather than a dictionary that
/// anything can write to.
public struct AnvilLedger: Sendable, Equatable {
    public enum Resolution: Sendable, Equatable {
        case stamped(AnvilStamp)
        case void(reason: String)
    }

    public struct Entry: Sendable, Equatable {
        /// What decided the block. Never changes once set.
        public let resolution: Resolution
        /// Every later stamp for the same block, in order. Kept, inert.
        public internal(set) var refused: [AnvilStamp]

        public var stamp: AnvilStamp? {
            if case let .stamped(stamp) = resolution { return stamp }
            return nil
        }
    }

    public private(set) var entries: [String: Entry] = [:]

    public init() {}

    public subscript(block: String) -> Entry? { entries[block] }

    /// Records a stamp. Returns true when it decided the block, false when
    /// the block was already decided and this one was refused.
    @discardableResult
    public mutating func record(_ stamp: AnvilStamp) -> Bool {
        if entries[stamp.block] != nil {
            entries[stamp.block]?.refused.append(stamp)
            return false
        }
        entries[stamp.block] = Entry(resolution: .stamped(stamp), refused: [])
        return true
    }

    /// `@void id=… reason=…`: withdraws an unanswered block. Too late for a
    /// block already decided, which is exactly what "absorbing" means.
    public mutating func void(_ block: String, reason: String) {
        guard entries[block] == nil else { return }
        entries[block] = Entry(resolution: .void(reason: reason), refused: [])
    }
}
