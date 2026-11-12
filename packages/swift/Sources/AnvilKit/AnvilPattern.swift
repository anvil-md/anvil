import Foundation

/// The `pattern=` dialect on an `@input` field (SPEC 4.3.1), and its matcher.
///
/// A port of `packages/parser/src/pattern.ts`, held to the same corpus cases.
/// It is NOT `NSRegularExpression`, for two reasons that are each enough:
///
/// 1. The pattern is agent-authored. A backtracking engine handed `(a+)+$`
///    and forty `a`s and a `b` hangs the main thread. This compiles to a
///    Thompson NFA and simulates it state-set by state-set, so a match is
///    linear in the value whatever the pattern says.
/// 2. ICU and JavaScript disagree: `\d` is every Unicode digit in ICU and
///    0-9 in JavaScript, and ICU's `$` matches before a trailing newline. A
///    check that passes on the phone and fails on the server is a block the
///    human can never get to stamp.
///
/// Total, like the parser: `compile` returns a verdict and never throws out.
public struct AnvilPattern: Sendable {
    public static let maxLength = 256
    public static let maxBound = 100
    public static let maxMatchLength = 4096
    static let maxStates = 5000

    public let source: String
    let states: [State]
    let start: Int

    /// A pattern that passed the dialect, or the reason it did not, in words
    /// an agent can act on.
    public enum Verdict: Sendable {
        case ok(AnvilPattern)
        case refused(String)
    }

    public static func compile(_ source: String) -> Verdict {
        let scalars = source.unicodeScalars.map(\.value)
        if scalars.isEmpty { return .refused("an empty pattern checks nothing") }
        if scalars.count > maxLength {
            return .refused("\(scalars.count) characters is past the \(maxLength) a pattern may have")
        }
        do {
            var reader = Reader(scalars)
            let ast = try reader.parse()
            var builder = Builder()
            let frag = try builder.alternation(ast)
            let match = builder.states.count
            builder.states.append(.match)
            builder.patch(frag.outs, to: match)
            return .ok(AnvilPattern(source: source, states: builder.states, start: frag.start))
        } catch let refusal as Refusal {
            return .refused(refusal.why)
        } catch {
            return .refused("the pattern could not be read")
        }
    }

    /// Does the WHOLE value match? Anchored at both ends, always (SPEC 4.3.1).
    public func matches(_ value: String) -> Bool {
        let scalars = value.unicodeScalars.map(\.value)
        if scalars.count > Self.maxMatchLength { return false }
        var current = Set<Int>()
        var seen = Set<Int>()
        closure(from: start, at: 0, length: scalars.count, into: &current, seen: &seen)
        for (position, scalar) in scalars.enumerated() {
            var next = Set<Int>()
            var visited = Set<Int>()
            for index in current {
                if case let .set(set, out) = states[index], set.contains(scalar) {
                    closure(from: out, at: position + 1, length: scalars.count, into: &next, seen: &visited)
                }
            }
            if next.isEmpty { return false }
            current = next
        }
        return current.contains { if case .match = states[$0] { true } else { false } }
    }

    private func closure(from origin: Int, at position: Int, length: Int, into: inout Set<Int>, seen: inout Set<Int>) {
        var stack = [origin]
        while let index = stack.popLast() {
            guard index >= 0, !seen.contains(index) else { continue }
            seen.insert(index)
            switch states[index] {
            case let .split(a, b): stack.append(b); stack.append(a)
            case let .start(out): if position == 0 { stack.append(out) }
            case let .end(out): if position == length { stack.append(out) }
            case .set, .match: into.insert(index)
            }
        }
    }

    // MARK: - character sets

    /// Sorted, merged, inclusive code point ranges.
    struct CharSet: Sendable {
        var ranges: [ClosedRange<UInt32>]

        init(_ ranges: [ClosedRange<UInt32>]) {
            let sorted = ranges.sorted { $0.lowerBound < $1.lowerBound }
            var merged: [ClosedRange<UInt32>] = []
            for range in sorted {
                if let last = merged.last, range.lowerBound <= last.upperBound &+ 1 {
                    merged[merged.count - 1] = last.lowerBound ... max(last.upperBound, range.upperBound)
                } else {
                    merged.append(range)
                }
            }
            self.ranges = merged
        }

        static func single(_ scalar: UInt32) -> CharSet { CharSet([scalar ... scalar]) }

        /// Everything not in the set, the surrogate block excluded: no
        /// well-formed string holds a lone surrogate.
        var complement: CharSet {
            var out: [ClosedRange<UInt32>] = []
            var next: UInt32 = 0
            for range in ranges {
                if range.lowerBound > next { out.append(next ... range.lowerBound - 1) }
                next = range.upperBound &+ 1
            }
            if next <= 0x10FFFF { out.append(next ... 0x10FFFF) }
            var clean: [ClosedRange<UInt32>] = []
            for range in out {
                if range.upperBound < 0xD800 || range.lowerBound > 0xDFFF {
                    clean.append(range)
                } else {
                    if range.lowerBound < 0xD800 { clean.append(range.lowerBound ... 0xD7FF) }
                    if range.upperBound > 0xDFFF { clean.append(0xE000 ... range.upperBound) }
                }
            }
            return CharSet(clean)
        }

        var isSingle: Bool { ranges.count == 1 && ranges[0].lowerBound == ranges[0].upperBound }

        func contains(_ scalar: UInt32) -> Bool {
            var low = 0
            var high = ranges.count - 1
            while low <= high {
                let mid = (low + high) / 2
                let range = ranges[mid]
                if scalar < range.lowerBound { high = mid - 1 } else if scalar > range.upperBound { low = mid + 1 } else { return true }
            }
            return false
        }

        /// ASCII only, on purpose: the JavaScript meaning, and the one a form means.
        static let digit = CharSet([0x30 ... 0x39])
        static let word = CharSet([0x30 ... 0x39, 0x41 ... 0x5A, 0x5F ... 0x5F, 0x61 ... 0x7A])
        /// ECMAScript WhiteSpace and LineTerminator.
        static let space = CharSet([
            0x09 ... 0x0D, 0x20 ... 0x20, 0xA0 ... 0xA0, 0x1680 ... 0x1680, 0x2000 ... 0x200A,
            0x2028 ... 0x2029, 0x202F ... 0x202F, 0x205F ... 0x205F, 0x3000 ... 0x3000, 0xFEFF ... 0xFEFF,
        ])
        /// `.` is every code point but the four line terminators.
        static let dot = CharSet([0x0A ... 0x0A, 0x0D ... 0x0D, 0x2028 ... 0x2029]).complement

        static let classEscapes: [Character: CharSet] = [
            "d": digit, "D": digit.complement,
            "w": word, "W": word.complement,
            "s": space, "S": space.complement,
        ]
    }

    // MARK: - the AST

    indirect enum Atom: Sendable {
        case set(CharSet)
        case group([[Term]])
        case start
        case end
    }

    struct Term: Sendable {
        var atom: Atom
        var min: Int
        /// Nil for an unbounded repeat.
        var max: Int?
    }

    struct Refusal: Error {
        let why: String
        init(_ why: String) { self.why = why }
    }

    struct Reader {
        let scalars: [UInt32]
        var index = 0

        init(_ scalars: [UInt32]) { self.scalars = scalars }

        static let controlEscapes: [Character: UInt32] = ["t": 0x09, "n": 0x0A, "v": 0x0B, "f": 0x0C, "r": 0x0D]
        static let identity = Set("^$\\.*+?()[]{}|/-")

        var isDone: Bool { index >= scalars.count }

        func peek(_ offset: Int = 0) -> Character? {
            let at = index + offset
            guard at < scalars.count, let scalar = Unicode.Scalar(scalars[at]) else { return nil }
            return Character(scalar)
        }

        mutating func take() -> Character? {
            let character = peek()
            index += 1
            return character
        }

        mutating func parse() throws -> [[Term]] {
            let alternation = try alternation()
            if let character = peek() {
                throw Refusal(character == ")" ? "a \")\" with no \"(\" before it" : "unexpected \"\(character)\"")
            }
            return alternation
        }

        mutating func alternation() throws -> [[Term]] {
            var branches = [try sequence()]
            while peek() == "|" {
                index += 1
                branches.append(try sequence())
            }
            return branches
        }

        mutating func sequence() throws -> [Term] {
            var terms: [Term] = []
            while let character = peek(), character != "|", character != ")" {
                var term = Term(atom: try atom(), min: 1, max: 1)
                try quantifier(&term)
                terms.append(term)
            }
            return terms
        }

        mutating func quantifier(_ term: inout Term) throws {
            guard let character = peek() else { return }
            var bounds: (Int, Int?)
            switch character {
            case "*": bounds = (0, nil); index += 1
            case "+": bounds = (1, nil); index += 1
            case "?": bounds = (0, 1); index += 1
            case "{":
                guard let braces = try braces() else {
                    throw Refusal("a \"{\" that is not a {n}, {n,} or {n,m} repeat; write \\{ for a literal brace")
                }
                bounds = braces
            default: return
            }
            switch term.atom {
            case .start, .end: throw Refusal("\"^\" and \"$\" cannot be repeated")
            default: break
            }
            term.min = bounds.0
            term.max = bounds.1
            // A lazy `?` only changes which match a backtracking engine finds
            // first. A whole-value yes/no does not care, so it is accepted.
            if peek() == "?" { index += 1 }
            if let next = peek(), "*+?{".contains(next) {
                throw Refusal("\"\(next)\" repeats a repeat; wrap the first one in (?: ) if that is what you mean")
            }
        }

        /// `{n}`, `{n,}`, `{n,m}`. Nil, consuming nothing, when it is not one.
        mutating func braces() throws -> (Int, Int?)? {
            let start = index
            index += 1
            func digits(_ reader: inout Reader) -> String {
                var text = ""
                while let character = reader.peek(), character.isASCII, character.isNumber {
                    text.append(character)
                    reader.index += 1
                }
                return text
            }
            let low = digits(&self)
            guard !low.isEmpty else { index = start; return nil }
            var high: String? = low
            if peek() == "," {
                index += 1
                let text = digits(&self)
                high = text.isEmpty ? nil : text
            }
            guard peek() == "}" else { index = start; return nil }
            index += 1
            // Digit strings, so a bound is bounded by its length before Int()
            // could overflow on it.
            let min = low.count > 4 ? Int.max : Int(low) ?? Int.max
            let max = high.map { $0.count > 4 ? Int.max : Int($0) ?? Int.max }
            if min > AnvilPattern.maxBound || (max ?? 0) > AnvilPattern.maxBound {
                throw Refusal("a repeat bound above \(AnvilPattern.maxBound); a field check never needs one")
            }
            if let max, min > max { throw Refusal("{\(min),\(max)} has a minimum above its maximum") }
            return (min, max)
        }

        mutating func atom() throws -> Atom {
            guard let character = take() else { throw Refusal("unexpected end") }
            switch character {
            case ".": return .set(CharSet.dot)
            case "^": return .start
            case "$": return .end
            case "[": return .set(try characterClass())
            case "(": return try group()
            case "\\": return .set(try escape(inClass: false))
            case "*", "+", "?": throw Refusal("\"\(character)\" has nothing before it to repeat")
            case "{": throw Refusal("a \"{\" with nothing to repeat; write \\{ for a literal brace")
            case "}", "]": throw Refusal("a lone \"\(character)\"; write \\\(character) for the literal character")
            default: return .set(.single(scalars[index - 1]))
            }
        }

        mutating func group() throws -> Atom {
            if peek() == "?" {
                index += 1
                let kind = take()
                if kind != ":" {
                    if kind == "=" || kind == "!" { throw Refusal("lookahead is not in the dialect") }
                    if kind == "<" {
                        let next = peek()
                        throw Refusal(next == "=" || next == "!" ? "lookbehind is not in the dialect" : "named groups are not in the dialect")
                    }
                    throw Refusal("inline flags are not in the dialect")
                }
            }
            let body = try alternation()
            guard take() == ")" else { throw Refusal("a \"(\" that is never closed") }
            return .group(body)
        }

        mutating func escape(inClass: Bool) throws -> CharSet {
            guard let character = take() else { throw Refusal("a pattern cannot end in a lone backslash") }
            if let set = CharSet.classEscapes[character] { return set }
            if let control = Self.controlEscapes[character] { return .single(control) }
            if character == "b" || character == "B" {
                throw Refusal(inClass ? "[\\b] is not in the dialect; write \\x08" : "word boundaries are not in the dialect")
            }
            if character == "k" || ("1" ... "9").contains(character) { throw Refusal("backreferences are not in the dialect") }
            if character == "p" || character == "P" { throw Refusal("Unicode property escapes are not in the dialect") }
            if character == "c" { throw Refusal("control-letter escapes are not in the dialect") }
            if character == "0" {
                if let next = peek(), next.isASCII, next.isNumber { throw Refusal("octal escapes are not in the dialect") }
                return .single(0)
            }
            if character == "x" { return .single(try hex(2, name: "x")) }
            if character == "u" {
                if peek() == "{" {
                    index += 1
                    var text = ""
                    while let next = peek(), next.isHexDigit { text.append(next); index += 1 }
                    guard !text.isEmpty, take() == "}" else { throw Refusal("a \\u{…} escape with no closing brace") }
                    guard text.count <= 6, let value = UInt32(text, radix: 16), value <= 0x10FFFF else {
                        throw Refusal("\\u{\(text)} is past the last code point")
                    }
                    return .single(value)
                }
                return .single(try hex(4, name: "u"))
            }
            if Self.identity.contains(character) { return .single(scalars[index - 1]) }
            throw Refusal("\"\\\(character)\" is not an escape in the dialect")
        }

        mutating func hex(_ count: Int, name: String) throws -> UInt32 {
            var text = ""
            for _ in 0 ..< count {
                guard let character = take(), character.isHexDigit else {
                    throw Refusal("a \\\(name) escape needs \(count) hex digits")
                }
                text.append(character)
            }
            return UInt32(text, radix: 16) ?? 0
        }

        /// `[` has been consumed. Reads to the matching `]`.
        mutating func characterClass() throws -> CharSet {
            var negated = false
            if peek() == "^" { index += 1; negated = true }
            var ranges: [ClosedRange<UInt32>] = []
            var first = true
            while true {
                guard let character = peek() else { throw Refusal("a \"[\" that is never closed") }
                if character == "]" {
                    if first { throw Refusal("an empty class \"[]\" matches nothing") }
                    index += 1
                    break
                }
                first = false
                let low = try classAtom()
                // A `-` is a range only BETWEEN two characters. At either
                // edge it is a literal hyphen, the way `[a-z-]` is written.
                if peek() == "-", let after = peek(1), after != "]" {
                    index += 1
                    let high = try classAtom()
                    guard low.isSingle, high.isSingle else {
                        throw Refusal("a range like [\\d-z] needs a single character at each end")
                    }
                    let a = low.ranges[0].lowerBound
                    let b = high.ranges[0].lowerBound
                    guard a <= b else { throw Refusal("a class range runs backwards") }
                    ranges.append(a ... b)
                    continue
                }
                ranges.append(contentsOf: low.ranges)
            }
            let set = CharSet(ranges)
            return negated ? set.complement : set
        }

        mutating func classAtom() throws -> CharSet {
            guard let character = take() else { throw Refusal("a \"[\" that is never closed") }
            if character == "\\" { return try escape(inClass: true) }
            return .single(scalars[index - 1])
        }
    }

    // MARK: - the NFA

    enum State: Sendable {
        case set(CharSet, out: Int)
        case split(Int, Int)
        case start(out: Int)
        case end(out: Int)
        case match
    }

    enum Slot { case out, a, b }

    struct Fragment {
        let start: Int
        var outs: [(Int, Slot)]
    }

    struct Builder {
        var states: [State] = []

        mutating func add(_ state: State) throws -> Int {
            if states.count >= AnvilPattern.maxStates {
                throw Refusal("the pattern expands past what a field check may hold; lower its repeat bounds")
            }
            states.append(state)
            return states.count - 1
        }

        mutating func patch(_ outs: [(Int, Slot)], to target: Int) {
            for (index, slot) in outs {
                switch (states[index], slot) {
                case let (.set(set, _), .out): states[index] = .set(set, out: target)
                case (.start, .out): states[index] = .start(out: target)
                case (.end, .out): states[index] = .end(out: target)
                case let (.split(_, b), .a): states[index] = .split(target, b)
                case let (.split(a, _), .b): states[index] = .split(a, target)
                default: break
                }
            }
        }

        /// An epsilon pass-through, for an empty branch or a `{0}` repeat.
        mutating func empty() throws -> Fragment {
            let index = try add(.split(-1, -1))
            return Fragment(start: index, outs: [(index, .a), (index, .b)])
        }

        mutating func alternation(_ branches: [[Term]]) throws -> Fragment {
            var fragments: [Fragment] = []
            for branch in branches { fragments.append(try sequence(branch)) }
            var accumulated = try fragments.first ?? empty()
            for next in fragments.dropFirst() {
                let split = try add(.split(accumulated.start, next.start))
                accumulated = Fragment(start: split, outs: accumulated.outs + next.outs)
            }
            return accumulated
        }

        mutating func sequence(_ terms: [Term]) throws -> Fragment {
            guard !terms.isEmpty else { return try empty() }
            var accumulated: Fragment?
            for term in terms {
                let fragment = try self.term(term)
                if let previous = accumulated {
                    patch(previous.outs, to: fragment.start)
                    accumulated = Fragment(start: previous.start, outs: fragment.outs)
                } else {
                    accumulated = fragment
                }
            }
            if let accumulated { return accumulated }
            return try empty()
        }

        mutating func atom(_ atom: Atom) throws -> Fragment {
            switch atom {
            case let .group(body): return try alternation(body)
            case let .set(set):
                let index = try add(.set(set, out: -1))
                return Fragment(start: index, outs: [(index, .out)])
            case .start:
                let index = try add(.start(out: -1))
                return Fragment(start: index, outs: [(index, .out)])
            case .end:
                let index = try add(.end(out: -1))
                return Fragment(start: index, outs: [(index, .out)])
            }
        }

        mutating func star(_ term: Term) throws -> Fragment {
            let split = try add(.split(-1, -1))
            let body = try atom(term.atom)
            patch([(split, .a)], to: body.start)
            patch(body.outs, to: split)
            return Fragment(start: split, outs: [(split, .b)])
        }

        mutating func optional(_ term: Term) throws -> Fragment {
            let body = try atom(term.atom)
            let split = try add(.split(body.start, -1))
            return Fragment(start: split, outs: body.outs + [(split, .b)])
        }

        /// `x{n,m}` is n copies of x then m-n optional ones, each compiled
        /// afresh so no two iterations share a state.
        mutating func term(_ term: Term) throws -> Fragment {
            if term.min == 1, term.max == 1 { return try atom(term.atom) }
            var parts: [Fragment] = []
            for _ in 0 ..< term.min { parts.append(try atom(term.atom)) }
            if let max = term.max {
                if max > term.min { for _ in term.min ..< max { parts.append(try optional(term)) } }
            } else {
                parts.append(try star(term))
            }
            guard var accumulated = parts.first else { return try empty() }
            for next in parts.dropFirst() {
                patch(accumulated.outs, to: next.start)
                accumulated = Fragment(start: accumulated.start, outs: next.outs)
            }
            return accumulated
        }
    }
}
