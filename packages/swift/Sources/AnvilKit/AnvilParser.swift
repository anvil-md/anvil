import Foundation

/// A parsed ANVIL document.
public struct AnvilDocument: Sendable {
    /// Top-level blocks, in source order. A container's children are nested
    /// inside it rather than flattened here.
    public let blocks: [Parsed]

    /// Everything the parser refused to be silent about. Never empty because
    /// something went wrong "quietly" -- see ``AnvilWarning``.
    public let warnings: [AnvilWarning]

    public init(blocks: [Parsed], warnings: [AnvilWarning] = []) {
        self.blocks = blocks
        self.warnings = warnings
    }

    public struct Parsed: Identifiable, Sendable {
        public let id: String
        public let kind: String
        public let attributes: [String: String]
        public let prompt: String
        public let subtext: String?
        public let options: [AnvilOption]
        public let fields: [Field]
        public let scales: [Scale]
        public let tasks: [Task]
        public let prose: [String]
        public let literal: String?
        /// Blocks inside a `@grid` or `@stack`. Empty for everything else.
        public let children: [Parsed]

        public var selectMany: Bool { attributes["select"] == "many" }
        public var isContainer: Bool { AnvilKind(rawValue: kind)?.isContainer ?? false }
    }

    /// A `- [ ] ref | Label | meta` row. The box is the state.
    public struct Task: Identifiable, Sendable {
        public let id: String
        public let state: State
        public let ref: String
        public let label: String
        public let meta: String?
        public let detail: String?

        public enum State: String, Sendable {
            case todo, flight, done, blocked

            /// `[ ]` todo, `[~]` in flight (`/` and `-` alias it), `[x]` done,
            /// `[!]` blocked.
            public init(box: Character) {
                switch box {
                case "x", "X": self = .done
                case "~", "/", "-": self = .flight
                case "!": self = .blocked
                default: self = .todo
                }
            }
        }
    }

    public struct Field: Identifiable, Sendable {
        public let id: String
        public let name: String
        public let type: String
        public let required: Bool
        public let hint: String?
    }

    public struct Scale: Identifiable, Sendable {
        public let id: String
        public let name: String
        public let low: String
        public let high: String
        public let value: Int?
    }
}

/// A line-oriented ANVIL parser.
///
/// SPEC section 3: "Line-oriented, no lookahead. Leading whitespace is
/// insignificant." That is why this is small -- the grammar was designed so a
/// model streaming tokens cannot paint itself into a corner, and the same
/// property makes the parser almost trivial.
///
/// **This is a SUBSET.** It covers the block kinds there are views for today:
/// `@choice`, `@input`, `@scale`, `@note`, `@code`. The oracle is the 77-case
/// conformance corpus in `~/projects/anvil-md/packages/conformance/corpus.json`,
/// and this parser has NOT been run against it -- that is decision D2's track.
/// Until it has, treat this as a renderer's front end, not as a conformant
/// implementation.
///
/// SPEC section 3.1 also decides the failure mode for us: "A line beginning
/// with none of the above is treated as prose and appended to the current
/// prompt. This is deliberate: an agent that forgets a sigil gets
/// slightly-wrong rendering, never a crash." So nothing here throws.
public enum AnvilParser {
    /// SPEC 4.14. Two deep, and the third is flattened.
    static let maxLayoutDepth = 2

    public static func parse(_ source: String) -> AnvilDocument {
        var blocks: [AnvilDocument.Parsed] = []
        var warnings: [AnvilWarning] = []
        var current: Builder?
        /// Open containers, outermost first. SPEC 4.14 caps layout nesting at
        /// two deep, so this never grows past two -- a third `@grid` is
        /// FLATTENED into the one already open and warned about, rather than
        /// being parsed into a depth nothing can draw.
        var containers: [Builder] = []
        var literalBuffer: [String]?

        /// Finishes the open block into the innermost container, or top level.
        func closeCurrent() {
            guard let finished = current?.build() else { return }
            if containers.isEmpty { blocks.append(finished) } else { containers[containers.count - 1].children.append(finished) }
            current = nil
        }

        /// Closes the innermost container.
        func closeContainer() {
            closeCurrent()
            guard let finished = containers.popLast()?.build() else { return }
            if containers.isEmpty { blocks.append(finished) } else { containers[containers.count - 1].children.append(finished) }
        }

        func closeAll() {
            closeCurrent()
            while !containers.isEmpty { closeContainer() }
        }

        for (index, rawLine) in source.components(separatedBy: .newlines).enumerated() {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            let lineNumber = index + 1

            // Inside a ~~~ fence everything is verbatim, including sigils.
            if literalBuffer != nil {
                if line == "~~~" {
                    current?.literal = literalBuffer?.joined(separator: "\n")
                    literalBuffer = nil
                } else {
                    literalBuffer?.append(rawLine)
                }
                continue
            }

            if line.isEmpty { continue }
            if line.hasPrefix("#") { continue } // parsed, never rendered, never sent

            if line.hasPrefix("@") {
                let header = String(line.dropFirst())
                let name = split(header).first ?? ""

                if name == "end" {
                    if containers.isEmpty {
                        warnings.append(AnvilWarning("stray @end with no open layout", line: lineNumber))
                    } else {
                        closeContainer()
                    }
                    continue
                }

                let builder = Builder(header: header, line: lineNumber)
                warnings.append(contentsOf: builder.headerWarnings)

                if builder.resolvedKind?.isContainer == true {
                    closeCurrent()
                    if containers.count >= Self.maxLayoutDepth {
                        // SPEC 4.14: two deep is the cap. A third is flattened
                        // into the one already open rather than parsed into a
                        // depth no renderer can draw.
                        warnings.append(
                            AnvilWarning("layout past two deep was flattened", line: lineNumber)
                        )
                    } else {
                        containers.append(builder)
                    }
                } else {
                    closeCurrent()
                    current = builder
                }
                continue
            }

            // A row belongs to the open BLOCK. If there is no block but a
            // container is open, the row has nowhere to go -- SPEC 4.14 says a
            // layout holds blocks, not rows, and eating it silently would be
            // "parsed and then not drawn".
            guard let block = current else {
                if !containers.isEmpty, "-+_%".contains(line.first ?? " ") {
                    warnings.append(
                        AnvilWarning("a layout holds blocks, not rows, so the row was dropped", line: lineNumber)
                    )
                }
                continue
            }

            switch line.first {
            case "?": block.prompt.append(rest(line))
            case ":": block.subtext = rest(line)
            case ">": block.addDetail(rest(line))
            case "-": warnings.append(contentsOf: block.addRow(rest(line), line: lineNumber))
            case "_": warnings.append(contentsOf: block.addField(rest(line), line: lineNumber))
            case "%": warnings.append(contentsOf: block.addScale(rest(line), line: lineNumber))
            case "+": block.addChips(rest(line))
            case "=": block.addPrefill(rest(line))
            default:
                if line == "~~~" {
                    literalBuffer = []
                } else {
                    // Sigil-less line: prose appended to the prompt. Never a
                    // crash -- SPEC 3.1 is explicit that a forgotten sigil is
                    // slightly-wrong rendering, not an error.
                    block.prompt.append(line)
                }
            }
        }

        closeAll()
        return AnvilDocument(blocks: blocks, warnings: warnings)
    }

    private static func rest(_ line: String) -> String {
        String(line.dropFirst()).trimmingCharacters(in: .whitespaces)
    }

    // MARK: - builder

    private final class Builder {
        let kind: String
        let resolvedKind: AnvilKind?
        var attributes: [String: String] = [:]
        var prompt: [String] = []
        var subtext: String?
        var prose: [String] = []
        var literal: String?
        var children: [AnvilDocument.Parsed] = []
        private(set) var headerWarnings: [AnvilWarning] = []
        private var options: [AnvilOption] = []
        private var fields: [AnvilDocument.Field] = []
        private var scales: [AnvilDocument.Scale] = []
        private var tasks: [AnvilDocument.Task] = []

        init(header: String, line: Int) {
            var tokens = AnvilParser.split(header)
            let name = tokens.isEmpty ? "" : tokens.removeFirst()
            let known = AnvilKind(rawValue: name)

            // SPEC 11: an unknown block becomes a warned NOTE rather than
            // nothing. Dropping it would be "parsed and then not drawn", which
            // CLAUDE.md lists as a bug in its own right.
            if known == nil, !name.isEmpty {
                headerWarnings.append(AnvilWarning("unknown block @\(name), rendered as a note", line: line))
            }
            resolvedKind = known ?? .note
            kind = (known ?? .note).rawValue

            for token in tokens {
                guard let equals = token.firstIndex(of: "=") else {
                    attributes[token] = "true" // bare attr = true
                    continue
                }
                let key = String(token[token.startIndex ..< equals])
                var value = String(token[token.index(after: equals)...])
                if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
                    value = String(value.dropFirst().dropLast())
                }
                attributes[key] = value
            }

            // SPEC 4.14: layout has no identity, because layout cannot be
            // answered. The id is refused rather than honoured.
            if resolvedKind?.isContainer == true, attributes["id"] != nil {
                headerWarnings.append(AnvilWarning("layout has no id, so it was dropped", line: line))
                attributes["id"] = nil
            }
        }

        /// A `-` row. What it means depends on the block, so this is where the
        /// box-row rule lives.
        func addRow(_ body: String, line: Int) -> [AnvilWarning] {
            var text = body
            let destructive = text.hasPrefix("!")
            if destructive { text = String(text.dropFirst()).trimmingCharacters(in: .whitespaces) }

            // `- [ ] ref | Label | meta` -- the box is the state.
            if let box = AnvilParser.boxState(text) {
                var warnings: [AnvilWarning] = []
                if resolvedKind?.usesBoxRows != true {
                    // SPEC 4.12: it still renders, with a complaint. The row is
                    // read as an ordinary option so nothing is lost.
                    warnings.append(
                        AnvilWarning("a task row uses only @card and @board, not @\(kind)", line: line)
                    )
                }
                let cells = AnvilParser.cells(box.rest)
                let ref = cells.first ?? ""
                let label = cells.count > 1 ? cells[1] : ref
                tasks.append(
                    AnvilDocument.Task(
                        id: ref,
                        state: box.state,
                        ref: ref,
                        label: label,
                        meta: cells.count > 2 ? cells[2] : nil,
                        detail: nil
                    )
                )
                // The value is the REF, never the box glyph.
                options.append(
                    AnvilOption(id: ref, title: label, subtitle: cells.count > 2 ? cells[2] : nil,
                                side: nil, destructive: destructive)
                )
                return warnings
            }

            let cells = AnvilParser.cells(text)
            guard !cells.isEmpty else { return [] }

            // `- value | Label | hint`. With one cell the value IS the label.
            let value = cells[0]
            let label = cells.count > 1 ? cells[1] : cells[0]
            let hint = cells.count > 2 ? cells[2] : nil

            options.append(
                AnvilOption(
                    id: value,
                    title: label,
                    subtitle: hint,
                    side: cells.count > 3 ? cells[3] : nil,
                    destructive: destructive
                )
            )
            return []
        }

        /// `>` is prose, or the DETAIL of the task row above it.
        func addDetail(_ body: String) {
            if let last = tasks.popLast() {
                tasks.append(
                    AnvilDocument.Task(
                        id: last.id, state: last.state, ref: last.ref,
                        label: last.label, meta: last.meta,
                        detail: [last.detail, body].compactMap { $0 }.joined(separator: " ")
                    )
                )
            } else {
                prose.append(body)
            }
        }

        /// `+ chip | chip | chip`. Kept as attributes so nothing is parsed and
        /// then silently dropped.
        func addChips(_ body: String) {
            let cells = AnvilParser.cells(body)
            guard !cells.isEmpty else { return }
            attributes["chips"] = cells.joined(separator: "|")
        }

        /// `= field=value`, an `@example` prefill.
        func addPrefill(_ body: String) {
            guard let equals = body.firstIndex(of: "=") else { return }
            let key = String(body[body.startIndex ..< equals]).trimmingCharacters(in: .whitespaces)
            let value = String(body[body.index(after: equals)...]).trimmingCharacters(in: .whitespaces)
            attributes["prefill.\(key)"] = value
        }

        func addField(_ body: String, line: Int) -> [AnvilWarning] {
            let cells = AnvilParser.cells(body)
            guard var name = cells.first else { return [] }
            let required = name.hasSuffix("*")
            if required { name = String(name.dropLast()) }

            // SPEC 4.3: a type outside the closed set falls back to `text` AND
            // says so. Silently rendering a text box for `emial` would hide a
            // typo the author can still fix.
            let raw = cells.count > 1 ? cells[1] : "text"
            let (type, fellBack) = AnvilFieldType.resolve(raw)

            fields.append(
                AnvilDocument.Field(
                    id: name,
                    name: name,
                    type: type.rawValue,
                    required: required,
                    hint: cells.count > 2 ? cells[2] : nil
                )
            )
            return fellBack
                ? [AnvilWarning("unknown field type \(raw), fell back to text", line: line)]
                : []
        }

        func addScale(_ body: String, line: Int) -> [AnvilWarning] {
            let cells = AnvilParser.cells(body)
            guard cells.count >= 3 else { return [] }

            // SPEC 4.8: the knob stays on its track. A default outside
            // 1...steps would place the handle off the rail, so it is clamped
            // and reported rather than drawn at 300%.
            let steps = Int(attributes["steps"] ?? "") ?? 5
            let authored = cells.count > 3 ? Int(cells[3]) : nil
            var warnings: [AnvilWarning] = []
            var value = authored
            if let authored, authored < 1 || authored > steps {
                warnings.append(
                    AnvilWarning("scale default \(authored) is out of range 1...\(steps)", line: line)
                )
                value = min(max(authored, 1), steps)
            }

            scales.append(
                AnvilDocument.Scale(
                    id: cells[0],
                    name: cells[0],
                    low: cells[1],
                    high: cells[2],
                    value: value
                )
            )
            return warnings
        }

        func build() -> AnvilDocument.Parsed {
            AnvilDocument.Parsed(
                // A container has no identity at all -- not a derived one
                // either, because there is nothing to answer.
                id: resolvedKind?.isContainer == true ? "" : (attributes["id"] ?? kind),
                kind: kind,
                attributes: attributes,
                prompt: prompt.joined(separator: " "),
                subtext: subtext,
                options: options,
                fields: fields,
                scales: scales,
                tasks: tasks,
                prose: prose,
                literal: literal,
                children: children
            )
        }
    }

    /// Reads a `[ ]` / `[x]` / `[~]` / `[!]` box off the front of a row.
    static func boxState(_ text: String) -> (state: AnvilDocument.Task.State, rest: String)? {
        guard text.hasPrefix("[") else { return nil }
        let afterBracket = text.dropFirst()
        guard let close = afterBracket.firstIndex(of: "]") else { return nil }
        let inside = afterBracket[afterBracket.startIndex ..< close]
        // Exactly one character, or empty for `[]`.
        guard inside.count <= 1 else { return nil }
        let rest = String(afterBracket[afterBracket.index(after: close)...])
            .trimmingCharacters(in: .whitespaces)
        return (AnvilDocument.Task.State(box: inside.first ?? " "), rest)
    }

    /// Splits a header on whitespace, keeping `key="quoted value"` together.
    static func split(_ header: String) -> [String] {
        var tokens: [String] = []
        var token = ""
        var quoted = false
        for character in header {
            if character == "\"" { quoted.toggle(); token.append(character); continue }
            if character == " ", !quoted {
                if !token.isEmpty { tokens.append(token); token = "" }
                continue
            }
            token.append(character)
        }
        if !token.isEmpty { tokens.append(token) }
        return tokens
    }

    /// Splits a row on pipes. A literal pipe inside a label is `\|`.
    static func cells(_ body: String) -> [String] {
        var cells: [String] = []
        var cell = ""
        var escaped = false
        for character in body {
            if escaped { cell.append(character); escaped = false; continue }
            if character == "\\" { escaped = true; continue }
            if character == "|" { cells.append(cell.trimmingCharacters(in: .whitespaces)); cell = ""; continue }
            cell.append(character)
        }
        cells.append(cell.trimmingCharacters(in: .whitespaces))
        return cells.filter { !$0.isEmpty || cells.count == 1 }
    }
}
