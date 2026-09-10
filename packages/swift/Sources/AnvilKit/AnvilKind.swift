import Foundation

/// The closed set of block kinds.
///
/// CLAUDE.md: "The closed set is deliberate. Nearly everything anyone wants to
/// add is one of these with an attribute set. Adding a `@kind` is a real
/// decision, not a convenience."
///
/// So this is an allowlist, and anything outside it is an unknown block that
/// degrades to a warned note (§11) rather than being dropped or crashed on.
public enum AnvilKind: String, CaseIterable, Sendable {
    case choice, gallery, input, code, note, upload, link, scale, order
    case example, void, card, board, message, chart, flow, connect
    case grid, stack

    /// A container holds other blocks and cannot itself be answered, which is
    /// why §4.14 refuses it an id.
    public var isContainer: Bool { self == .grid || self == .stack }

    /// Which kinds legitimately use the `- [ ] ref | Label` box row.
    ///
    /// `@card` and `@board` use it for tasks; `@flow` uses it for a node. A box
    /// row anywhere else is the §4.12 warning -- it still renders, because
    /// parsed-and-then-not-drawn is a bug, but it complains.
    public var usesBoxRows: Bool {
        self == .card || self == .board || self == .flow
    }
}

/// The control an `@input` field row asks for.
///
/// SPEC 4.3 lists a closed set. An unknown type falls back to `text` and says
/// so, rather than rendering nothing or guessing -- CLAUDE.md names this
/// exact degradation as the required behaviour.
public enum AnvilFieldType: String, CaseIterable, Sendable {
    case text, longtext, number, bool, secret, path, url, date

    /// Returns the type and whether it had to fall back.
    public static func resolve(_ raw: String) -> (type: AnvilFieldType, fellBack: Bool) {
        if let known = AnvilFieldType(rawValue: raw.lowercased()) { return (known, false) }
        return (.text, true)
    }
}

/// Something the parser noticed and refused to be silent about.
///
/// CLAUDE.md rule 3: "The parser is TOTAL. No throw path, anywhere, ever.
/// Malformed input degrades with a VISIBLE warning." A warning is therefore not
/// diagnostics -- it is the error channel, and dropping one is the same class of
/// bug as throwing.
public struct AnvilWarning: Sendable, Hashable, CustomStringConvertible {
    public let message: String
    /// 1-based line in the fence, when it is known.
    public let line: Int?

    public init(_ message: String, line: Int? = nil) {
        self.message = message
        self.line = line
    }

    public var description: String {
        line.map { "line \($0): \(message)" } ?? message
    }
}
