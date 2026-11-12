import Foundation

/// The rows a live block showed the human (SPEC 4.1.2). Handed to
/// `stamp(for:offered:)` so the record carries them: calling the function
/// again tomorrow returns tomorrow's rows, and law IV (SPEC 7.1) says the rows
/// the human chose BETWEEN are part of the record.
public struct AnvilLiveOffer: Sendable, Hashable {
    public let fn: String
    public let rows: [AnvilOption]

    public init(fn: String, rows: [AnvilOption]) {
        self.fn = fn
        self.rows = rows
    }
}

public extension AnvilAnswer {
    /// The stamp for a block whose rows came from `offered`. Nil `offered`
    /// means the written rows were shown, and the stamp is the plain one.
    func stamp(
        for block: AnvilDocument.Parsed,
        offered: AnvilLiveOffer?,
        at: Date? = nil,
        by: String? = nil,
        body: String? = nil
    ) -> AnvilStamp {
        let plain = stamp(for: block, at: at, by: by, body: body)
        guard let offered else { return plain }
        // `query=` sits with the payload, ahead of `at` and `by`, which close
        // every stamp.
        let tail: Set<String> = ["at", "by"]
        let payload = plain.attributes.filter { !tail.contains($0.key) }
        let closing = plain.attributes.filter { tail.contains($0.key) }
        return AnvilStamp(
            block: plain.block,
            kind: plain.kind,
            attributes: payload + [.init("query", offered.fn)] + closing,
            children: offered.rows.map(AnvilStamp.offeredChild) + plain.children,
            body: plain.body
        )
    }
}

public extension AnvilStamp {
    /// The function a live block's rows came from, when they did.
    var query: String? { attribute("query") }

    /// The rows the human was shown, read back from `<offered>`, in order. Nil
    /// when the stamp has none, which means the block's written rows were the
    /// ones shown: draw those.
    var offered: [AnvilOption]? {
        let rows = children.filter { $0.name == "offered" }.compactMap { child -> AnvilOption? in
            guard let value = child.attribute("value"), !value.isEmpty else { return nil }
            var attributes: [String: String] = [:]
            for key in Self.offeredFaceKeys {
                if let v = child.attribute(key) { attributes[key] = v }
            }
            return AnvilOption(
                id: value,
                title: child.attribute("label") ?? value,
                subtitle: child.attribute("hint"),
                destructive: child.attribute("danger") == "true",
                attributes: attributes
            )
        }
        return rows.isEmpty ? nil : rows
    }

    /// What a row looks like, beyond its words. Written in this order.
    internal static let offeredFaceKeys = ["img", "swatch", "font", "sample", "alt"]

    internal static func offeredChild(_ row: AnvilOption) -> Child {
        var attributes: [Attribute] = [.init("value", row.id), .init("label", row.title)]
        if let hint = row.subtitle, !hint.isEmpty { attributes.append(.init("hint", hint)) }
        for key in offeredFaceKeys {
            if let v = row.attributes[key], !v.isEmpty { attributes.append(.init(key, v)) }
        }
        if row.destructive { attributes.append(.init("danger", "true")) }
        return Child("offered", attributes)
    }
}
