import Foundation

/// One answerable option in an ANVIL block.
public struct AnvilOption: Identifiable, Sendable, Hashable {
    public let id: String
    public let title: String
    public let subtitle: String?
    /// A right-aligned trailing value: a duration, a count, a price.
    public let side: String?
    /// A `- !scrap` row. The LABEL carries the colour; the row does not become
    /// a red slab, because it is still one option among several.
    public let destructive: Bool
    /// Trailing `key=value` cells: `img` `swatch` `font` `sample` (SPEC 3,
    /// 4.2). Unordered, and kept apart from the positional cells -- a
    /// `swatch=#111,#fff` read as the hint cell is drawn at the human as text.
    /// Raw: these land in attribute position, so a renderer allowlists them
    /// (SPEC 8.3) before it uses one.
    public let attributes: [String: String]

    public init(
        id: String,
        title: String,
        subtitle: String? = nil,
        side: String? = nil,
        destructive: Bool = false,
        attributes: [String: String] = [:]
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.side = side
        self.destructive = destructive
        self.attributes = attributes
    }
}

/// Whether a block can still be answered.
///
/// SPEC section 7.1, and a covenant in this repo: **a stamp is frozen.** An
/// answered block is append-only history. It never becomes re-answerable, never
/// mutates, never disappears, and the rejected options stay visible because
/// they are part of the record.
///
/// This is an enum rather than a `Bool` plus a date so that "stamped" cannot
/// exist without the evidence of what was picked and when.
public enum AnvilState: Sendable, Hashable {
    /// Answerable. Rows are controls.
    case open
    /// Answered, and the answer has not been confirmed yet (SPEC 7.2). The
    /// picked rows show at once and nothing is a control, because there is
    /// no unstamp: pending is on its way to `stamped`, never back to `open`
    /// on the human's say-so. Only a refusal from the other end (a nak)
    /// returns a block to open.
    case pending(picked: Set<String>)
    /// Answered at `time`. Rows are history, and nothing is a control.
    case stamped(picked: Set<String>, time: String)
    /// Offered, never answered, and the window has closed.
    case expired(time: String)
    /// Withdrawn by the sender before it was answered.
    case void(reason: String)

    public var isStamped: Bool {
        if case .stamped = self { return true }
        return false
    }

    public var isPending: Bool {
        if case .pending = self { return true }
        return false
    }

    /// The single question every renderer asks: may the human touch this?
    ///
    /// Only `.open` is interactive. If this ever returns true for a stamped
    /// block, the covenant is broken -- `StampIsFrozenTests` asserts it.
    public var isAnswerable: Bool {
        if case .open = self { return true }
        return false
    }

    public func role(of option: AnvilOption) -> Role {
        switch self {
        case .open: .answerable
        case let .stamped(picked, _), let .pending(picked):
            picked.contains(option.id) ? .picked : .rejected
        case .expired, .void: .rejected
        }
    }

    public enum Role: Sendable { case answerable, picked, rejected }
}
