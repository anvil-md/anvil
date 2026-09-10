import Foundation

/// One `- Label | value | note` row of a `@chart`.
public struct AnvilDatum: Identifiable, Sendable, Hashable {
    /// Position in the series. NOT the label -- a `values=` chart has no
    /// labels at all, so labels are not unique and cannot be the identity.
    public let id: Int
    /// Empty for a `values=` series. Deliberately not an invented ordinal:
    /// "never draw what is not there" applies to axis text too.
    public let label: String
    public let value: Double
    /// The text the value was parsed out of.
    ///
    /// SPEC 4.16.1: "The printed value is what the agent typed. `4.8k` renders
    /// as `4.8k`, not as `4800`, because the row is the record and rounding it
    /// into a canonical form edits the record."
    public let raw: String
    public let note: String?

    public init(index: Int, label: String, value: Double, raw: String, note: String? = nil) {
        id = index
        self.label = label
        self.value = value
        self.raw = raw
        self.note = note
    }
}

/// The range a chart's bars are drawn against.
///
/// SPEC 4.16.2, one rule applied three times: **the range must contain every
/// value it draws.** The floor defaults to zero so a bar's length is its
/// magnitude; negative data lowers the floor to REACH the data, never to
/// flatter it; and neither authored bound may exclude a value, because a bar
/// clipped to fit prints a number at the end of a bar too short to be that
/// number.
public struct AnvilDomain: Sendable, Hashable {
    public let floor: Double
    public let top: Double
    /// True when `min=` was honoured. False when the data overrode it.
    public let authoredFloor: Bool
    /// True when `max=` was honoured. False when the data overrode it.
    public let authoredTop: Bool

    /// Where zero sits in the range, as a percentage. A truncated axis has to
    /// announce itself, and this is the number the notch is drawn at.
    public var zeroPct: Double {
        guard top != floor else { return 0 }
        return ((0 - floor) / (top - floor)) * 100
    }

    /// Computes the range from the data and the authored bounds, and reports
    /// any bound that had to be overruled.
    static func resolve(
        values: [Double],
        min authoredMin: Double?,
        max authoredMax: Double?,
        line: Int?
    ) -> (domain: AnvilDomain, warnings: [AnvilWarning]) {
        guard let dataMin = values.min(), let dataMax = values.max() else {
            return (AnvilDomain(floor: 0, top: 0, authoredFloor: false, authoredTop: false), [])
        }

        var warnings: [AnvilWarning] = []

        // Zero by default; negative data lowers it to reach the data.
        var floor = Swift.min(0, dataMin)
        var authoredFloor = false
        if let authoredMin {
            if authoredMin <= dataMin {
                floor = authoredMin
                authoredFloor = true
            } else {
                floor = dataMin
                warnings.append(
                    AnvilWarning(
                        "min=\"\(trim(authoredMin))\" is above the smallest value "
                            + "(\(trim(dataMin))); using \(trim(dataMin)) so nothing is clipped",
                        line: line
                    )
                )
            }
        }

        var top = dataMax
        var authoredTop = false
        if let authoredMax {
            if authoredMax >= dataMax {
                top = authoredMax
                authoredTop = true
            } else {
                warnings.append(
                    AnvilWarning(
                        "max=\"\(trim(authoredMax))\" is below the largest value "
                            + "(\(trim(dataMax))); using \(trim(dataMax)) so nothing is clipped",
                        line: line
                    )
                )
            }
        }

        return (
            AnvilDomain(floor: floor, top: top, authoredFloor: authoredFloor, authoredTop: authoredTop),
            warnings
        )
    }

    /// Prints 90 rather than 90.0, so a warning quotes the number the author
    /// would recognise.
    private static func trim(_ value: Double) -> String {
        value == value.rounded() && abs(value) < 1e15
            ? String(Int(value))
            : String(value)
    }
}

public extension AnvilParser {
    /// Reads a chart value cell.
    ///
    /// Accepts thousands separators and a magnitude suffix, because an agent
    /// writes `4.8k` and `1,204` and both are numbers a human means. Returns
    /// nil for anything that is not a number at all -- SPEC 4.16.2 refuses
    /// that row rather than drawing it at zero, because "zero is a claim, and
    /// a bar of length nothing under `Mon` says Monday was nought rather than
    /// unreadable".
    static func chartValue(_ cell: String) -> Double? {
        var text = cell.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: "%", with: "")
        guard !text.isEmpty else { return nil }

        var multiplier = 1.0
        if let last = text.last, let scale = magnitudes[Character(last.lowercased())] {
            multiplier = scale
            text = String(text.dropLast())
        }
        guard let number = Double(text) else { return nil }
        return number * multiplier
    }

    private static var magnitudes: [Character: Double] {
        ["k": 1_000, "m": 1_000_000, "b": 1_000_000_000]
    }
}
