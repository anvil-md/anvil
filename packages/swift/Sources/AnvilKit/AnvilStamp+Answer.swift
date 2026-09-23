import Foundation

public extension AnvilAnswer {
    /// The stamp this answer sends back for `block`, per SPEC 6.2.
    ///
    /// - Parameters:
    ///   - at: when the human answered. Written as ISO 8601, so a stamp read
    ///     back days later still knows which day.
    ///   - by: who answered, where more than one human can act.
    ///   - body: the courtesy sentence. Nil writes the default one.
    func stamp(for block: AnvilDocument.Parsed, at: Date? = nil, by: String? = nil, body: String? = nil) -> AnvilStamp {
        let (attributes, children, courtesy) = payload(for: block)
        var tail: [AnvilStamp.Attribute] = []
        if let at { tail.append(.init("at", at.ISO8601Format())) }
        if let by, !by.isEmpty { tail.append(.init("by", by)) }
        return AnvilStamp(
            block: block.id,
            kind: block.kind,
            attributes: attributes + tail,
            children: children,
            body: body ?? courtesy
        )
    }

    /// SPEC 7.6: "replaced by `••••••` in the stamp record, the rendered
    /// receipt, and the tag. The transcript is a permanent artifact."
    static let mask = "••••••"

    private func payload(
        for block: AnvilDocument.Parsed
    ) -> ([AnvilStamp.Attribute], [AnvilStamp.Child], String) {
        switch self {
        case let .choice(option):
            return (
                [.init("value", option.id), .init("label", option.title)],
                [],
                "I picked \(option.title)."
            )

        case let .choices(options):
            return (
                [
                    .init("values", options.map(\.id).joined(separator: ",")),
                    .init("labels", options.map(\.title).joined(separator: ",")),
                ],
                [],
                "I picked \(Self.list(options.map(\.title)))."
            )

        case let .input(values):
            // Block order, not dictionary order, and an empty field is not
            // part of the answer. The mask is applied HERE, from the block's
            // own declaration, so a caller that passes the raw secret still
            // cannot put it in the transcript.
            let children = block.fields.compactMap { field -> AnvilStamp.Child? in
                guard let value = values[field.name], !value.isEmpty else { return nil }
                return AnvilStamp.Child(
                    "field",
                    [.init("name", field.name)],
                    text: field.fieldType == .secret ? Self.mask : value
                )
            }
            return ([], children, "I filled it in.")

        case let .scale(values):
            let steps = Self.steps(of: block)
            let dials = block.scales.compactMap { dial -> (AnvilDocument.Scale, Int)? in
                (values[dial.name] ?? dial.value).map { (dial, min(max($0, 1), steps)) }
            }
            let children = dials.map { dial, notch in
                AnvilStamp.Child("dial", [
                    .init("name", dial.name),
                    .init("value", "\(notch)"),
                    .init("norm", Self.norm(notch, steps: steps)),
                    .init("poles", "\(dial.low)|\(dial.high)"),
                ])
            }
            let said = dials.map { "\($0.0.name) to \($0.1) of \(steps)" }
            return ([.init("steps", "\(steps)")], children, "I set \(Self.list(said)).")

        case let .connect(state, granted, account):
            let provider = block.attributes["provider"] ?? "unknown"
            let asked = block.options
            let kept = asked.filter { granted.contains($0.id) }
            let refused = state == "partial" ? asked.filter { !granted.contains($0.id) } : []
            var attributes: [AnvilStamp.Attribute] = [.init("state", state), .init("provider", provider)]
            if !kept.isEmpty {
                attributes.append(.init("values", kept.map(\.id).joined(separator: ",")))
                attributes.append(.init("labels", kept.map(\.title).joined(separator: ",")))
            }
            if !refused.isEmpty { attributes.append(.init("refused", refused.map(\.id).joined(separator: ","))) }
            if let account { attributes.append(.init("account", account)) }
            let courtesy = switch state {
            case "connected": "I connected \(provider)."
            case "partial": "I connected \(provider), but not all of it."
            default: "I would rather not connect that."
            }
            return (attributes, [], courtesy)
        }
    }

    /// SPEC 4.8: default 5, range 2-11.
    static func steps(of block: AnvilDocument.Parsed) -> Int {
        min(max(Int(block.attributes["steps"] ?? "") ?? 5, 2), 11)
    }

    /// The notch as `0..1`, two places at most and no trailing zeros: `0.25`,
    /// `0.5`, `1`.
    static func norm(_ notch: Int, steps: Int) -> String {
        let value = Double(notch - 1) / Double(max(steps - 1, 1))
        return (value * 100).rounded() / 100 == value.rounded()
            ? "\(Int(value.rounded()))"
            : String(format: "%.2f", value).replacingOccurrences(of: "0+$", with: "", options: .regularExpression)
    }

    private static func list(_ items: [String]) -> String {
        switch items.count {
        case 0: "nothing"
        case 1: items[0]
        default: items.dropLast().joined(separator: ", ") + " and " + items[items.count - 1]
        }
    }
}
