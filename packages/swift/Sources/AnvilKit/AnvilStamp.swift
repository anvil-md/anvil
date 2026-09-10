import Foundation

/// What the phone sends back when a block is answered.
///
/// SPEC section 6.1: `<stamp block="…" kind="…" [payload]>a sentence a human
/// would have typed</stamp>`. **Attributes are the truth; the body is the
/// courtesy.** The CLIENT writes this. The agent never does -- which is why it
/// lives in AnvilKit rather than being something a renderer improvises.
///
/// Named `<stamp>` and deliberately not `<input>`, because `<input>` collides
/// with a real HTML element that a renderer or a model could plausibly confuse.
public struct AnvilStamp: Identifiable, Sendable, Equatable {
    public let id: UUID
    public let block: String
    public let kind: String
    public let attributes: [(key: String, value: String)]
    public let children: [String]
    /// The sentence a human would have typed.
    public let body: String
    public let at: Date

    public init(
        block: String,
        kind: String,
        attributes: [(key: String, value: String)] = [],
        children: [String] = [],
        body: String,
        at: Date = Date()
    ) {
        id = UUID()
        self.block = block
        self.kind = kind
        self.attributes = attributes
        self.children = children
        self.body = body
        self.at = at
    }

    public static func == (a: AnvilStamp, b: AnvilStamp) -> Bool { a.id == b.id }

    /// The wire form, exactly as section 6.1 specifies it.
    public var xml: String {
        var head = "<stamp block=\"\(escape(block))\" kind=\"\(escape(kind))\""
        for (key, value) in attributes {
            head += " \(key)=\"\(escape(value))\""
        }
        head += ">"

        var lines = [head]
        lines += children.map { "  \($0)" }
        if !body.isEmpty { lines.append(body) }
        lines.append("</stamp>")
        return lines.joined(separator: "\n")
    }

    private func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
}

public extension AnvilStamp {
    /// `@choice select=one`
    static func choice(block: String, option: AnvilOption) -> AnvilStamp {
        AnvilStamp(
            block: block,
            kind: "choice",
            attributes: [("value", option.id), ("label", option.title)],
            body: "I picked \(option.title)."
        )
    }

    /// `@choice select=many` / `@gallery`
    static func choice(block: String, options: [AnvilOption], kind: String = "choice") -> AnvilStamp {
        AnvilStamp(
            block: block,
            kind: kind,
            attributes: [
                ("values", options.map(\.id).joined(separator: ",")),
                ("labels", options.map(\.title).joined(separator: ",")),
            ],
            body: "I picked \(list(options.map(\.title)))."
        )
    }

    /// `@scale`
    static func scale(block: String, name: String, value: Int, steps: Int, poles: String) -> AnvilStamp {
        AnvilStamp(
            block: block,
            kind: "scale",
            attributes: [("steps", "\(steps)")],
            children: [
                "<dial name=\"\(name)\" value=\"\(value)\" "
                    + "norm=\"\(String(format: "%.2f", Double(value - 1) / Double(max(steps - 1, 1))))\" "
                    + "poles=\"\(poles)\"/>",
            ],
            body: "I set \(name) to \(value) of \(steps)."
        )
    }

    /// `@input`
    static func input(block: String, fields: [(String, String)]) -> AnvilStamp {
        AnvilStamp(
            block: block,
            kind: "input",
            children: fields.map { "<field name=\"\($0.0)\">\($0.1)</field>" },
            body: "I filled it in."
        )
    }

    /// `@connect`. The grant, not the click -- section 4.18.3 is explicit that
    /// the stamp waits for the provider's answer.
    static func connect(
        block: String,
        provider: String,
        granted: [AnvilOption],
        account: String?
    ) -> AnvilStamp {
        var attributes = [
            ("provider", provider),
            ("state", granted.isEmpty ? "declined" : "connected"),
            ("granted", granted.map(\.id).joined(separator: ",")),
        ]
        if let account { attributes.append(("account", account)) }
        return AnvilStamp(
            block: block,
            kind: "connect",
            attributes: attributes,
            body: granted.isEmpty
                ? "I did not connect \(provider)."
                : "I connected \(provider) with \(granted.count) scope\(granted.count == 1 ? "" : "s")."
        )
    }

    private static func list(_ items: [String]) -> String {
        switch items.count {
        case 0: "nothing"
        case 1: items[0]
        default: items.dropLast().joined(separator: ", ") + " and " + items[items.count - 1]
        }
    }
}
