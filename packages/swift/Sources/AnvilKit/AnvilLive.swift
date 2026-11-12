import Foundation

/// Live rows (SPEC 4.1.2). A port of `packages/parser/src/live.ts`, held to the
/// same corpus cases.
///
/// `query="calendar.free date=2026-11-14"` names a READ-ONLY function the host
/// owns. The host calls it once, when the block becomes answerable, and its
/// rows replace the written ones; the written rows are the fallback. The model
/// is never in the loop, and the stamp records every row that was offered
/// (`AnvilLiveOffer`), because calling the function again tomorrow returns
/// tomorrow's rows.
public struct AnvilLiveSource: Sendable, Hashable {
    /// Dotted lowercase: `calendar.free`.
    public let fn: String
    /// As written. Strings, always: the host's schema types them.
    public let args: [String: String]
}

public extension AnvilDocument.Parsed {
    /// The function this block's rows come from, or nil.
    var liveSource: AnvilLiveSource? {
        AnvilLiveRules.source(kind: kind, attributes: attributes)
    }
}

enum AnvilLiveRules {
    static let kinds: Set<String> = ["choice", "gallery"]
    static let maxArgs = 12

    /// What `query=` says, or nil when it says nothing usable. A bare `query`
    /// lands as "true", which names nothing, exactly as the reference parser's
    /// boolean does.
    static func raw(_ attributes: [String: String]) -> String? {
        guard let value = attributes["query"], value != "true" else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    static func source(kind: String, attributes: [String: String]) -> AnvilLiveSource? {
        guard let raw = raw(attributes), kinds.contains(kind) else { return nil }
        let words = raw.split(whereSeparator: \.isWhitespace).map(String.init)
        guard let head = words.first, isFunctionName(head) else { return nil }
        var args: [String: String] = [:]
        for arg in arguments(in: words.dropFirst().joined(separator: " ")).matches {
            guard args.count < maxArgs, args[arg.key] == nil else { continue }
            args[arg.key] = arg.value
        }
        return AnvilLiveSource(fn: head, args: args)
    }

    static func problems(kind: String, attributes: [String: String], hasRows: Bool, line: Int?) -> [AnvilWarning] {
        guard attributes["query"] != nil else { return [] }
        guard let raw = raw(attributes) else {
            return [AnvilWarning("query= names no function; the written rows are shown", line: line)]
        }
        guard kinds.contains(kind) else {
            return [AnvilWarning("query= only fills @choice and @gallery rows; on @\(kind) it is ignored", line: line)]
        }
        let words = raw.split(whereSeparator: \.isWhitespace).map(String.init)
        let head = words.first ?? ""
        guard isFunctionName(head) else {
            return [AnvilWarning(
                "query=\"\(head)\" is not a function name like calendar.free; the written rows are shown", line: line
            )]
        }
        var out: [AnvilWarning] = []
        let scan = arguments(in: words.dropFirst().joined(separator: " "))
        let stray = scan.stray.trimmingCharacters(in: .whitespacesAndNewlines)
        if !stray.isEmpty { out.append(AnvilWarning("query= arguments are key=value; \"\(stray)\" is ignored", line: line)) }
        var seen: Set<String> = []
        var twice: String?
        for arg in scan.matches {
            if seen.contains(arg.key), twice == nil { twice = arg.key }
            seen.insert(arg.key)
        }
        if let twice { out.append(AnvilWarning("query= names \(twice) twice; the first is used", line: line)) }
        if seen.count > maxArgs {
            out.append(AnvilWarning("query= takes at most \(maxArgs) arguments; the rest are ignored", line: line))
        }
        if !hasRows {
            out.append(AnvilWarning(
                "query=\(head) has no written rows to fall back on; a host without it shows no options", line: line
            ))
        }
        return out
    }

    /// `[a-z][a-z0-9_]*` segments joined by dots.
    static func isFunctionName(_ s: String) -> Bool {
        let segments = s.split(separator: ".", omittingEmptySubsequences: false)
        return !segments.isEmpty && segments.allSatisfy { segment in
            guard let first = segment.first, first.isASCII, first.isLowercase else { return false }
            return segment.allSatisfy { $0.isASCII && ($0.isLowercase || $0.isNumber || $0 == "_") }
        }
    }

    struct Argument { let key: String, value: String }

    /// The reference's `([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|(\S+))`,
    /// scanned the way a global regex scans: try at each position, and on a
    /// miss move one character on. Hand-written so both languages read an
    /// argument list the same way, whatever their regex engines think `\S` is.
    static func arguments(in text: String) -> (matches: [Argument], stray: String) {
        let chars = Array(text)
        var matches: [Argument] = []
        var stray = ""
        var i = 0
        while i < chars.count {
            if let (arg, end) = argument(chars, at: i) {
                matches.append(arg)
                i = end
            } else {
                stray.append(chars[i])
                i += 1
            }
        }
        return (matches, stray)
    }

    private static func argument(_ chars: [Character], at start: Int) -> (Argument, Int)? {
        func isWord(_ c: Character) -> Bool { c.isASCII && (c.isLetter || c.isNumber || c == "_") }
        guard start < chars.count, chars[start].isASCII, chars[start].isLetter || chars[start] == "_" else { return nil }
        var j = start + 1
        while j < chars.count, isWord(chars[j]) || chars[j] == "-" { j += 1 }
        guard j < chars.count, chars[j] == "=" else { return nil }
        let key = String(chars[start ..< j])
        let k = j + 1
        guard k < chars.count else { return nil }
        if chars[k] == "\"" || chars[k] == "'",
           let close = chars[(k + 1)...].firstIndex(of: chars[k]) {
            return (Argument(key: key, value: String(chars[(k + 1) ..< close])), close + 1)
        }
        var end = k
        while end < chars.count, !chars[end].isWhitespace { end += 1 }
        guard end > k else { return nil }
        return (Argument(key: key, value: String(chars[k ..< end])), end)
    }
}
