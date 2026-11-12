import Foundation

/// A value from outside the transcript: what a host function returned.
/// Decoded strictly, so a `1` never reads as `true`.
public enum AnvilJSON: Sendable, Hashable, Decodable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([AnvilJSON])
    case object([String: AnvilJSON])

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([AnvilJSON].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: AnvilJSON].self) {
            self = .object(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else {
            self = try .number(container.decode(Double.self))
        }
    }
}

/// A function's answer, turned into rows (SPEC 4.1.2).
public struct AnvilLiveRows: Sendable, Hashable {
    public let options: [AnvilOption]
    /// Said out loud (SPEC 11), never dropped: a host shows them like parse warnings.
    public let warnings: [String]

    /// Past this many rows a human stops scanning. All are still drawn.
    static let warnAt = 12

    /// Read field by field. A row with no value is skipped, a second row with
    /// the same value is skipped (a stamp names a row by its value), and the
    /// allowlists of SPEC 8.3 still apply where a renderer uses `img` or `swatch`.
    public init(_ result: AnvilJSON) {
        var warnings: [String] = []
        guard case let .array(list) = result else {
            self.init(options: [], warnings: ["the function did not return a list of rows"])
            return
        }
        var seen: Set<String> = []
        var options: [AnvilOption] = []
        for item in list {
            guard case let .object(row) = item else {
                warnings.append("a row that is not an object was skipped")
                continue
            }
            let text = { (key: String) -> String? in
                Self.text(row[key])?.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            guard let value = text("value"), !value.isEmpty else {
                warnings.append("a row with no value was skipped")
                continue
            }
            guard seen.insert(value).inserted else {
                warnings.append("two rows answer to \"\(value)\"; the second was skipped")
                continue
            }
            var attributes: [String: String] = [:]
            for key in ["img", "font", "sample", "alt"] {
                if let v = text(key), !v.isEmpty { attributes[key] = v }
            }
            if case let .array(colours) = row["swatch"] {
                let strings = colours.compactMap { if case let .string(s) = $0 { s } else { nil } }
                if !strings.isEmpty { attributes["swatch"] = strings.joined(separator: ",") }
            }
            let label = text("label").flatMap { $0.isEmpty ? nil : $0 } ?? value
            let hint = text("hint").flatMap { $0.isEmpty ? nil : $0 }
            options.append(AnvilOption(
                id: value, title: label, subtitle: hint, destructive: row["danger"] == .bool(true), attributes: attributes
            ))
        }
        if options.count > Self.warnAt {
            warnings.append("\(options.count) live rows is past the point a human scans; all are shown")
        }
        self.init(options: options, warnings: warnings)
    }

    init(options: [AnvilOption], warnings: [String]) {
        self.options = options
        self.warnings = warnings
    }

    /// A string as itself; a whole number as its digits. A fraction has no
    /// spelling every language agrees on, and a value is compared as text.
    private static func text(_ json: AnvilJSON?) -> String? {
        switch json {
        case let .string(s): return s
        case let .number(n) where n.rounded() == n && abs(n) <= 9_007_199_254_740_991: return String(Int64(n))
        default: return nil
        }
    }
}
