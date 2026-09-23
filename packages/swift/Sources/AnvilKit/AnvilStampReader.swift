import Foundation

/// Stamps read back out of a turn's text.
///
/// A transcript is where a stamp LIVES (SPEC 7.1, law II: "the stamp lives on
/// the server"), so a client that wants to know whether a block is answered
/// reads the human turns it already has. This is that reader: the inverse of
/// `AnvilStamp.xml`, and nothing looser.
///
/// The input is untrusted text (SPEC 8.1) typed by whoever could type into the
/// conversation. So the reader is TOTAL, like the parser: no throw path, and
/// anything that is not a well-formed stamp is left in the prose, where it is
/// drawn as the words it is rather than dropped.
public struct AnvilStampRead: Sendable, Equatable {
    /// Every well-formed `<stamp>` in the turn, in touch order.
    public let stamps: [AnvilStamp]
    /// The turn with the stamps taken out, trimmed. Empty for a turn that was
    /// only stamps -- which then renders as the blocks it answered and
    /// nowhere else (SPEC 6.3).
    public let prose: String

    public var isOnlyStamps: Bool { !stamps.isEmpty && prose.isEmpty }
}

public extension AnvilStamp {
    /// Reads every stamp out of `text`.
    static func read(_ text: String) -> AnvilStampRead {
        guard text.contains("<stamp") else { return AnvilStampRead(stamps: [], prose: text.trimmed) }
        var stamps: [AnvilStamp] = []
        var prose = ""
        var rest = Substring(text)
        while let open = rest.range(of: "<stamp") {
            prose += rest[rest.startIndex ..< open.lowerBound]
            if let (stamp, after) = element(rest[open.lowerBound...]) {
                stamps.append(stamp)
                rest = after
            } else {
                prose += rest[open]
                rest = rest[open.upperBound...]
            }
        }
        prose += rest
        return AnvilStampRead(stamps: stamps, prose: prose.trimmed)
    }

    /// One `<stamp …>…</stamp>` at the start of `s`, and what follows it.
    private static func element(_ s: Substring) -> (AnvilStamp, Substring)? {
        var cursor = XMLCursor(s.dropFirst("<stamp".count))
        guard cursor.atBoundary, let head = cursor.attributes(), cursor.eat(">"),
              let block = head.first(where: { $0.key == "block" })?.value, !block.isEmpty,
              let kind = head.first(where: { $0.key == "kind" })?.value, !kind.isEmpty,
              let close = cursor.rest.range(of: "</stamp>")
        else { return nil }

        var inner = XMLCursor(cursor.rest[cursor.rest.startIndex ..< close.lowerBound])
        var children: [Child] = []
        var body = ""
        while !inner.isAtEnd {
            if inner.peek("<"), let child = inner.child() {
                children.append(child)
            } else {
                body.append(inner.take())
            }
        }
        let payload = head.filter { $0.key != "block" && $0.key != "kind" }
        let stamp = AnvilStamp(
            block: block,
            kind: kind,
            attributes: payload,
            children: children,
            body: unescape(body.split(whereSeparator: \.isNewline).map { $0.trimmed }.filter { !$0.isEmpty }.joined(separator: " "))
        )
        return (stamp, cursor.rest[close.upperBound...])
    }

    static func unescape(_ s: String) -> String {
        guard s.contains("&") else { return s }
        return s.replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&apos;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&amp;", with: "&")
    }
}

/// A forward-only reader over the small XML subset a stamp uses: quoted
/// attributes, text, and one level of child elements.
private struct XMLCursor {
    private(set) var rest: Substring

    init(_ s: Substring) { rest = s }

    var isAtEnd: Bool { rest.isEmpty }
    var atBoundary: Bool { rest.first.map { $0.isWhitespace || $0 == ">" } ?? false }

    func peek(_ s: String) -> Bool { rest.hasPrefix(s) }

    mutating func eat(_ s: String) -> Bool {
        skipSpace()
        guard rest.hasPrefix(s) else { return false }
        rest = rest.dropFirst(s.count)
        return true
    }

    mutating func take() -> Character { rest.removeFirst() }

    mutating func skipSpace() {
        while let c = rest.first, c.isWhitespace { rest.removeFirst() }
    }

    /// `key="value" …` up to, not including, `>` or `/>`. Nil on anything
    /// malformed, so a broken tag is left as prose rather than half-read.
    mutating func attributes() -> [AnvilStamp.Attribute]? {
        var found: [AnvilStamp.Attribute] = []
        while true {
            skipSpace()
            guard let c = rest.first else { return nil }
            if c == ">" || rest.hasPrefix("/>") { return found }
            let key = rest.prefix { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" || $0 == ":" }
            guard !key.isEmpty else { return nil }
            rest = rest.dropFirst(key.count)
            guard eat("=") else { return nil }
            skipSpace()
            guard let quote = rest.first, quote == "\"" || quote == "'" else { return nil }
            rest.removeFirst()
            guard let end = rest.firstIndex(of: quote) else { return nil }
            found.append(.init(String(key), AnvilStamp.unescape(String(rest[rest.startIndex ..< end]))))
            rest = rest[rest.index(after: end)...]
        }
    }

    /// `<name attrs/>` or `<name attrs>text</name>`. On failure nothing is
    /// consumed, and the `<` is read as body text.
    mutating func child() -> AnvilStamp.Child? {
        var probe = self
        probe.rest.removeFirst()
        let name = probe.rest.prefix { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
        guard !name.isEmpty else { return nil }
        probe.rest = probe.rest.dropFirst(name.count)
        guard probe.atBoundary || probe.peek("/>"), let attributes = probe.attributes() else { return nil }
        if probe.eat("/>") {
            self = probe
            return .init(String(name), attributes)
        }
        guard probe.eat(">"), let close = probe.rest.range(of: "</\(name)>") else { return nil }
        let text = AnvilStamp.unescape(String(probe.rest[probe.rest.startIndex ..< close.lowerBound]))
        probe.rest = probe.rest[close.upperBound...]
        self = probe
        return .init(String(name), attributes, text: text)
    }
}

private extension StringProtocol {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
