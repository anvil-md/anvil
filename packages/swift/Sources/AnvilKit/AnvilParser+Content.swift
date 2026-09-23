import Foundation

extension AnvilParser {
    /// SPEC 11: "A block with no `id=` gets one derived from a hash of its
    /// kind and normalised body. This must be stable across re-renders and
    /// reloads, so it can only depend on content -- never on array position."
    ///
    /// Byte-for-byte the reference parser's `deriveId`
    /// (`packages/parser/src/parse.ts`): FNV-1a, 32 bits, over the UTF-16 code
    /// units of `kind + "\n" + body` with whitespace runs folded to one space,
    /// printed as `a` plus eight hex digits. It has to be the SAME function,
    /// not a similar one: the id is the `block=` in the stamp, and a block
    /// stamped on the web must be the block the phone freezes.
    ///
    /// This used to be `attributes["id"] ?? kind`, so every id-less `@choice`
    /// in a conversation was the block `choice`, and answering one answered
    /// all of them.
    static func deriveID(kind: String, body: [String]) -> String {
        let folded = body.joined(separator: "\n")
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        var hash: UInt32 = 0x811C_9DC5
        for unit in "\(kind)\n\(folded)".utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 0x0100_0193
        }
        let hex = String(hash, radix: 16)
        return "a" + String(repeating: "0", count: max(0, 8 - hex.count)) + hex
    }

    /// `legal_name` -> `Legal name`, the label a field row without one gets.
    static func titleCase(_ name: String) -> String {
        let spaced = name.replacingOccurrences(of: "[_-]+", with: " ", options: .regularExpression)
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }

    /// The keys an option row may carry as trailing `key=value` cells.
    static let optionKeys: Set = ["img", "swatch", "font", "sample"]

    /// Splits an option row's cells after the value into the positional ones
    /// (label, hint, side) and the `key=value` ones, which are unordered.
    static func optionCells(_ cells: ArraySlice<String>) -> (positional: [String], attributes: [String: String]) {
        var positional: [String] = []
        var attributes: [String: String] = [:]
        for cell in cells {
            if let equals = cell.firstIndex(of: "=") {
                let key = cell[cell.startIndex ..< equals].trimmingCharacters(in: .whitespaces).lowercased()
                if optionKeys.contains(key) {
                    var value = cell[cell.index(after: equals)...].trimmingCharacters(in: .whitespaces)
                    if let first = value.first, first == "\"" || first == "'" { value.removeFirst() }
                    if let last = value.last, last == "\"" || last == "'" { value.removeLast() }
                    attributes[key] = value.trimmingCharacters(in: .whitespaces)
                    continue
                }
            }
            positional.append(cell)
        }
        return (positional, attributes)
    }
}
