import Foundation

/// What a client sends back when a block is answered, and what it reads back
/// out of a transcript afterwards.
///
/// SPEC 6.1: `<stamp block="…" kind="…" [payload]>a sentence a human would
/// have typed</stamp>`. **Attributes are the truth; the body is the
/// courtesy.** The CLIENT writes this. The agent never does -- which is why it
/// lives in AnvilKit rather than being something a renderer improvises.
///
/// **One serializer** (SPEC 6.2). `xml` is the only place a stamp becomes
/// text, and every attribute and child goes through the same escaping. The
/// children used to be pre-built strings, and neither `<field>` nor `<dial>`
/// escaped anything: a field value of `a</field><field name="x">` rewrote the
/// record.
///
/// Named `<stamp>` and deliberately not `<input>`, because `<input>` collides
/// with a real HTML element that a renderer or a model could plausibly confuse.
public struct AnvilStamp: Identifiable, Sendable, Hashable {
    /// One `key="value"`. Ordered, because the wire form is read by people too.
    public struct Attribute: Sendable, Hashable {
        public let key: String
        public let value: String

        public init(_ key: String, _ value: String) {
            self.key = key
            self.value = value
        }
    }

    /// One child element: `<field name="legal">Acme Ltd</field>`,
    /// `<dial name="formal" value="2" …/>`.
    public struct Child: Sendable, Hashable {
        public let name: String
        public let attributes: [Attribute]
        /// Text content. Nil writes a self-closing element.
        public let text: String?

        public init(_ name: String, _ attributes: [Attribute] = [], text: String? = nil) {
            self.name = name
            self.attributes = attributes
            self.text = text
        }

        public func attribute(_ key: String) -> String? {
            attributes.first { $0.key == key }?.value
        }
    }

    /// Local identity, for lists. Not part of the stamp: two stamps with the
    /// same block, kind, payload and body are the same stamp.
    public let id: UUID
    public let block: String
    public let kind: String
    /// The payload, in wire order, `at` and `by` included.
    public let attributes: [Attribute]
    public let children: [Child]
    /// The sentence a human would have typed. Empty writes no body line.
    public let body: String

    public init(
        block: String,
        kind: String,
        attributes: [Attribute] = [],
        children: [Child] = [],
        body: String = ""
    ) {
        id = UUID()
        self.block = block
        self.kind = kind
        self.attributes = attributes
        self.children = children
        self.body = body
    }

    public static func == (a: AnvilStamp, b: AnvilStamp) -> Bool {
        a.block == b.block && a.kind == b.kind && a.attributes == b.attributes
            && a.children == b.children && a.body == b.body
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(block)
        hasher.combine(kind)
        hasher.combine(attributes)
        hasher.combine(children)
        hasher.combine(body)
    }

    public func attribute(_ key: String) -> String? {
        attributes.first { $0.key == key }?.value
    }

    /// When the human answered, as written. SPEC 6.2: "Every tag may also
    /// carry `at=`." A stamp tapped offline at 14:02 and delivered at 16:30
    /// says 14:02 here; the transcript row says 16:30.
    public var at: String? { attribute("at") }
    /// Who answered, "where more than one human can act".
    public var by: String? { attribute("by") }

    /// `at`, read back. Accepts what this serializer writes (ISO 8601) and
    /// nothing looser: `14:02` has no day, and guessing one is inventing it.
    public var date: Date? {
        at.flatMap { try? Date($0, strategy: .iso8601) }
    }

    /// The `value`/`values` this stamp picked, as option ids.
    public var picked: [String] {
        if let value = attribute("value") { return [value] }
        return (attribute("values") ?? "").split(separator: ",").map(String.init)
    }

    /// The wire form, exactly as section 6.1 specifies it.
    public var xml: String {
        var lines = ["<stamp" + Self.write([Attribute("block", block), Attribute("kind", kind)] + attributes) + ">"]
        for child in children {
            let head = "  <\(child.name)" + Self.write(child.attributes)
            lines.append(child.text.map { "\(head)>\(Self.escape($0))</\(child.name)>" } ?? "\(head)/>")
        }
        if !body.isEmpty { lines.append(Self.escape(body)) }
        lines.append("</stamp>")
        return lines.joined(separator: "\n")
    }

    private static func write(_ attributes: [Attribute]) -> String {
        attributes.map { " \($0.key)=\"\(escape($0.value))\"" }.joined()
    }

    /// The one escaping policy. Text and attribute values both go through it.
    static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
}
