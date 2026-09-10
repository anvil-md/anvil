import Foundation

/// A counted `n/m` on a task row.
///
/// SPEC 4.12.1: a count is read from the END of the meta cell, so `Kit · 6/6`
/// is both an assignee and a rollup. An `n/m` sitting mid-cell is refused with
/// a warning rather than guessed at, because `PR 3/7 checks` is not a progress
/// count -- and neither is `due 24/12`, which is why the separator is required
/// rather than a bare space.
public struct AnvilRollup: Sendable, Hashable {
    public let done: Int
    public let total: Int
}

/// What a card's bar is drawn from.
///
/// CLAUDE.md rule 2: "Never author what can be counted." There is no
/// `progress=` -- the bar, the `3/7` and the `43%` all come from the rows on
/// screen, and `status=` loses to them.
public struct AnvilProgress: Sendable, Hashable {
    public let done: Int
    public let total: Int

    public var pct: Int {
        total == 0 ? 0 : Int((Double(done) / Double(total) * 100).rounded())
    }
}

public extension AnvilParser {
    /// Reads a rollup off the end of a meta cell.
    ///
    /// Returns the rollup, or the reason there is not one. A near-miss is
    /// reported rather than silently ignored: an `n/m` the author expected to
    /// count is worth a warning when it does not.
    static func rollup(in meta: String) -> (value: AnvilRollup?, warning: String?) {
        let trimmed = meta.trimmingCharacters(in: .whitespaces)
        guard let match = trailingCount(trimmed) else { return (nil, nil) }

        // Whole cell, or preceded by an explicit separator. A bare space is
        // not a separator -- `due 24/12` is a date, not two of twelve.
        let prefix = String(trimmed.dropLast(match.text.count))
            .trimmingCharacters(in: .whitespaces)
        let separated = prefix.isEmpty || prefix.hasSuffix("·") || prefix.hasSuffix("|")
        guard separated else {
            return (nil, "\(match.text) in \"\(trimmed)\" is not a rollup; it needs a · separator")
        }

        guard match.done <= match.total else {
            return (nil, "\(match.text) claims more done than total, so it is not counted")
        }
        return (AnvilRollup(done: match.done, total: match.total), nil)
    }

    /// Finds a `digits/digits` run anchored at the end of the string.
    private static func trailingCount(_ text: String) -> (done: Int, total: Int, text: String)? {
        var digitsAfter = ""
        var digitsBefore = ""
        var sawSlash = false

        for character in text.reversed() {
            if character.isNumber {
                if sawSlash { digitsBefore.insert(character, at: digitsBefore.startIndex) }
                else { digitsAfter.insert(character, at: digitsAfter.startIndex) }
                continue
            }
            if character == "/", !sawSlash, !digitsAfter.isEmpty {
                sawSlash = true
                continue
            }
            break
        }

        guard sawSlash, !digitsBefore.isEmpty, !digitsAfter.isEmpty,
              let done = Int(digitsBefore), let total = Int(digitsAfter)
        else { return nil }
        return (done, total, "\(digitsBefore)/\(digitsAfter)")
    }
}

/// One `- a -> b` edge of a `@flow`.
public struct AnvilEdge: Sendable, Hashable {
    public let from: String
    public let to: String
    public let label: String?
    public let directed: Bool

    /// The corpus spells an edge `from>to`.
    public var wire: String { "\(from)>\(to)" }
}

public extension AnvilParser {
    /// SPEC 4.17.4. Past this, the diagram is truncated and says how much it
    /// dropped -- `+N more` -- because parsed and then not drawn is a bug.
    static let flowNodeCap = 40

    /// Splits a `- a -> b -> c` row into its edges.
    ///
    /// A chain is a row of edges, not one edge with three ends, so `a -> b ->
    /// c` is two edges and the middle node is shared.
    static func edges(in row: String) -> (edges: [AnvilEdge], selfLoops: [String]) {
        let cells = cells(row)
        guard let path = cells.first else { return ([], []) }
        let label = cells.count > 1 ? cells[1] : nil

        // -> --> => and the arrow character all mean the same thing; -- is
        // undirected.
        var normalised = path
        for arrow in ["-->", "=>", "→", "->"] {
            normalised = normalised.replacingOccurrences(of: arrow, with: "\u{1}")
        }
        let undirected = normalised.contains("--")
        normalised = normalised.replacingOccurrences(of: "--", with: "\u{1}")

        let nodes = normalised.split(separator: "\u{1}")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard nodes.count >= 2 else { return ([], []) }

        var edges: [AnvilEdge] = []
        var selfLoops: [String] = []
        for (from, to) in zip(nodes, nodes.dropFirst()) {
            // SPEC 4.17.2: an edge that points at itself is refused. It cannot
            // be laid out and it says nothing a node does not already say.
            if from == to {
                selfLoops.append(from)
                continue
            }
            edges.append(AnvilEdge(from: from, to: to, label: label, directed: !undirected))
        }
        return (edges, selfLoops)
    }
}
