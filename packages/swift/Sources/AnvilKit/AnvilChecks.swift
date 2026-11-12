import Foundation

/// What an `@input` field row says its value must look like (SPEC 4.3.1),
/// already proven satisfiable by the parser.
///
/// A port of `packages/parser/src/checks.ts`. The host calls `check` to decide
/// whether the submit button is live; the server that receives the stamp runs
/// the reference implementation of the same rules, because a stamp is
/// untrusted input (SPEC 8.1). The corpus holds the two to the same verdicts.
public struct AnvilFieldChecks: Sendable, Hashable {
    /// A length in characters, a number, or a `YYYY-MM-DD` date, by type.
    public var min: String?
    public var max: String?
    /// The `pattern=` source. Matched against the WHOLE value.
    public var pattern: String?
    /// What the human is told when a check fails. The host's words otherwise.
    public var error: String?

    public init(min: String? = nil, max: String? = nil, pattern: String? = nil, error: String? = nil) {
        self.min = min
        self.max = max
        self.pattern = pattern
        self.error = error
    }

    public static let none = AnvilFieldChecks()
}

/// Why a value failed. The host turns it into words unless `error=` did.
public enum AnvilCheckReason: String, Sendable {
    case required, format, min, max, pattern
}

public enum AnvilFieldVerdict: Sendable, Equatable {
    case ok
    case failed(AnvilCheckReason, error: String?)

    public var isOK: Bool { self == .ok }
}

enum AnvilChecks {
    static let keys: Set<String> = ["min", "max", "pattern", "error"]

    /// The types whose min= and max= count characters.
    static let lengthTypes: Set<AnvilFieldType> = [.text, .longtext, .path, .secret, .email, .url]

    static let maxLengthBound = 100_000

    static func length(_ value: String) -> Int { value.unicodeScalars.count }

    static func isNumber(_ value: String) -> Bool {
        // ^[+-]?(\d+(\.\d*)?|\.\d+)$ -- spelled out so it cannot inherit ICU's
        // idea of what a digit is.
        var body = Substring(value)
        if let first = body.unicodeScalars.first, first == "+" || first == "-" { body = body.dropFirst() }
        let ascii = { (scalar: Unicode.Scalar) in scalar.value >= 0x30 && scalar.value <= 0x39 }
        let parts = body.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2 else { return false }
        let whole = parts[0]
        let fraction = parts.count == 2 ? parts[1] : nil
        guard whole.unicodeScalars.allSatisfy(ascii), fraction?.unicodeScalars.allSatisfy(ascii) ?? true else { return false }
        if whole.isEmpty { return !(fraction ?? "").isEmpty }
        return true
    }

    static func isDate(_ value: String) -> Bool {
        let scalars = Array(value.unicodeScalars)
        guard scalars.count == 10, scalars[4] == "-", scalars[7] == "-" else { return false }
        let digits = [0, 1, 2, 3, 5, 6, 8, 9]
        guard digits.allSatisfy({ scalars[$0].value >= 0x30 && scalars[$0].value <= 0x39 }) else { return false }
        let number = { (from: Int, count: Int) in
            scalars[from ..< from + count].reduce(0) { $0 * 10 + Int($1.value - 0x30) }
        }
        let year = number(0, 4)
        let month = number(5, 2)
        let day = number(8, 2)
        guard (1 ... 12).contains(month), day >= 1 else { return false }
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
        let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
        return day <= days
    }

    /// The JavaScript `\s` set, so "has whitespace" means the same thing here.
    static func hasSpace(_ value: String) -> Bool {
        value.unicodeScalars.contains { AnvilPattern.CharSet.space.contains($0.value) }
    }

    /// Deliberately loose: the only email check that is ever right is sending
    /// one, and a stricter rule refuses real addresses a human cannot change.
    static func isEmail(_ value: String) -> Bool {
        if hasSpace(value) { return false }
        let parts = value.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else { return false }
        let domain = parts[1]
        guard let dot = domain.lastIndex(of: ".") else { return false }
        return dot > domain.startIndex && domain.index(after: dot) < domain.endIndex
    }

    static func isURL(_ value: String) -> Bool {
        if hasSpace(value) { return false }
        let lower = value.lowercased()
        for scheme in ["http://", "https://"] where lower.hasPrefix(scheme) {
            return value.unicodeScalars.count > scheme.count
        }
        return false
    }

    static func format(_ type: AnvilFieldType) -> ((String) -> Bool)? {
        switch type {
        case .number: isNumber
        case .date: isDate
        case .email: isEmail
        case .url: isURL
        case .bool: { $0 == "true" || $0 == "false" }
        case .text, .longtext, .secret, .path: nil
        }
    }

    /// A bound read for this type, or the reason it cannot be one.
    static func bound(_ type: AnvilFieldType, _ raw: String) -> Result<String, Refused> {
        if lengthTypes.contains(type) {
            // Int() returns nil past Int.max, so a 30-digit bound is refused
            // here exactly as the reference refuses it for being too large.
            guard !raw.isEmpty, raw.unicodeScalars.allSatisfy({ $0.value >= 0x30 && $0.value <= 0x39 }),
                  let number = Int(raw), number <= maxLengthBound
            else {
                return .failure(Refused(
                    "is a length on a \(type.rawValue) field, so it must be a whole number up to \(maxLengthBound)"
                ))
            }
            return .success(String(number))
        }
        switch type {
        case .number: return isNumber(raw) ? .success(raw) : .failure(Refused("is not a number"))
        case .date: return isDate(raw) ? .success(raw) : .failure(Refused("is not a YYYY-MM-DD date"))
        default: return .failure(Refused("means nothing on a \(type.rawValue) field"))
        }
    }

    struct Refused: Error { let why: String; init(_ why: String) { self.why = why } }

    /// Orders two values of a type. Dates compare as text: fixed width.
    static func compare(_ type: AnvilFieldType, _ a: String, _ b: String) -> Int {
        if type == .date { return a < b ? -1 : a > b ? 1 : 0 }
        let x = Double(a) ?? 0
        let y = Double(b) ?? 0
        return x < y ? -1 : x > y ? 1 : 0
    }

    /// Validate the check cells a row carried; keep only what can work.
    static func settle(
        name: String, type: AnvilFieldType, required: Bool, raw: [String: String], line: Int
    ) -> (AnvilFieldChecks, [AnvilWarning]) {
        let place = "field \"\(name)\""
        var checks = AnvilFieldChecks()
        var warnings: [AnvilWarning] = []

        for key in ["min", "max"] {
            guard let value = raw[key] else { continue }
            switch bound(type, value) {
            case let .success(bound): if key == "min" { checks.min = bound } else { checks.max = bound }
            case let .failure(refused):
                warnings.append(AnvilWarning("\(place): \(key)=\"\(value)\" \(refused.why); not checked", line: line))
            }
        }

        if let min = checks.min, let max = checks.max, compare(type, min, max) > 0 {
            warnings.append(AnvilWarning(
                "\(place): min=\"\(min)\" is above max=\"\(max)\"; no value could pass, so neither is checked",
                line: line
            ))
            checks.min = nil
            checks.max = nil
        }

        if let pattern = raw["pattern"] {
            if !lengthTypes.contains(type) {
                let advice = type == .bool ? "" : "; use min= and max="
                warnings.append(AnvilWarning("\(place): pattern= does not apply to a \(type.rawValue) field\(advice)", line: line))
            } else {
                switch AnvilPattern.compile(pattern) {
                case .ok: checks.pattern = pattern
                case let .refused(why):
                    warnings.append(AnvilWarning("\(place): pattern refused, \(why); not checked", line: line))
                }
            }
        }

        if let error = raw["error"] {
            let hasCheck = required || checks.min != nil || checks.max != nil || checks.pattern != nil || format(type) != nil
            if hasCheck, !error.isEmpty {
                checks.error = error
            } else {
                warnings.append(AnvilWarning("\(place): error= has no check to explain; it is never shown", line: line))
            }
        }
        return (checks, warnings)
    }
}

public extension AnvilDocument.Field {
    /// The verdict for one value, as the control holds it in text: a switch is
    /// `"true"` or `"false"`, a date `YYYY-MM-DD`. An EMPTY optional field
    /// passes without running anything else.
    func check(_ value: String) -> AnvilFieldVerdict {
        let type = fieldType
        let fail = { (reason: AnvilCheckReason) in AnvilFieldVerdict.failed(reason, error: checks.error) }

        // A switch always has a value, so required can only mean "on".
        if type == .bool {
            if !value.isEmpty, value != "true", value != "false" { return fail(.format) }
            return required && value != "true" ? fail(.required) : .ok
        }

        if value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return required ? fail(.required) : .ok }
        if let format = AnvilChecks.format(type), !format(value) { return fail(.format) }

        let measure = AnvilChecks.lengthTypes.contains(type) ? String(AnvilChecks.length(value)) : value
        if let min = checks.min, AnvilChecks.compare(type, measure, min) < 0 { return fail(.min) }
        if let max = checks.max, AnvilChecks.compare(type, measure, max) > 0 { return fail(.max) }

        if let source = checks.pattern, case let .ok(pattern) = AnvilPattern.compile(source), !pattern.matches(value) {
            return fail(.pattern)
        }
        return .ok
    }
}

public extension AnvilDocument.Parsed {
    /// True when every field passes: the block may stamp.
    func inputReady(_ values: [String: String]) -> Bool {
        fields.allSatisfy { $0.check(values[$0.name] ?? "").isOK }
    }
}
