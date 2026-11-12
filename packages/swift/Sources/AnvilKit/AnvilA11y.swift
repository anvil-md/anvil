import Foundation

/// What a block is to assistive technology (SPEC 9.13). A port of
/// `packages/parser/src/a11y.ts`, held to the same corpus cases.
///
/// Inferred first, authored second: the `?` prompt is the name and the `:`
/// subtext the description, and `alt=` / `desc=` replace them only when the
/// visible text is not enough. A SwiftUI host maps these straight onto
/// `accessibilityLabel`, `accessibilityHint` and `accessibilityHidden`, and
/// posts an announcement on arrival when `live` is not `.off`.
public struct AnvilA11y: Sendable, Hashable {
    public enum Live: String, Sendable, CaseIterable { case off, polite, assertive }

    /// `alt=`, else the prompt. Empty for a bare note.
    public let label: String
    /// `desc=`, else the subtext.
    public let description: String
    public let live: Live
    /// True only for `decorative` on a block that asks nothing.
    public let hidden: Bool
    /// True when `label` came from `alt=`. A host sets an explicit
    /// accessibility label only then; otherwise the visible prompt already is one.
    public let labelAuthored: Bool
    public let descriptionAuthored: Bool
}

enum AnvilA11yRules {
    static let askKinds: Set<AnvilKind> = [.choice, .gallery, .input, .scale, .upload, .link, .order, .connect]

    static func asks(kind: AnvilKind?, attributes: [String: String]) -> Bool {
        guard let kind else { return false }
        if askKinds.contains(kind) { return true }
        if kind == .card || kind == .message { return !(attributes["ask"] ?? "").isEmpty }
        return false
    }

    static func liveMode(_ attributes: [String: String]) -> AnvilA11y.Live? {
        attributes["live"].flatMap { AnvilA11y.Live(rawValue: $0.lowercased()) }
    }

    /// The one inferred announcement: a danger note, the block an agent uses
    /// for "production is down".
    static func inferredLive(kind: AnvilKind?, attributes: [String: String]) -> AnvilA11y.Live {
        kind == .note && attributes["tone"] == "danger" ? .assertive : .off
    }

    static func isDecorative(_ attributes: [String: String]) -> Bool {
        guard let value = attributes["decorative"] else { return false }
        return value != "false"
    }

    static func problems(kind: AnvilKind?, attributes: [String: String], line: Int?) -> [AnvilWarning] {
        var out: [AnvilWarning] = []
        for key in ["alt", "desc"] {
            guard let value = attributes[key] else { continue }
            // A bare `alt` lands as "true", which is not words either.
            if value.trimmingCharacters(in: .whitespaces).isEmpty || value == "true" {
                out.append(AnvilWarning("\(key)= needs words; it is ignored", line: line))
            }
        }
        if let live = attributes["live"], liveMode(attributes) == nil {
            let fallback = inferredLive(kind: kind, attributes: attributes).rawValue
            out.append(AnvilWarning(
                "live=\"\(live)\" is not one of off, polite, assertive; the block is announced as \(fallback)",
                line: line
            ))
        }
        if isDecorative(attributes) {
            if kind?.isContainer == true {
                out.append(AnvilWarning(
                    "decorative on a @\(kind?.rawValue ?? "") would hide every block inside it; it is ignored", line: line
                ))
            } else if asks(kind: kind, attributes: attributes) {
                out.append(AnvilWarning(
                    "decorative is ignored: a question cannot be hidden from a screen reader while the agent waits for its answer",
                    line: line
                ))
            }
        }
        return out
    }
}

public extension AnvilDocument.Parsed {
    var a11y: AnvilA11y {
        let resolved = AnvilKind(rawValue: kind)
        let words = { (key: String) -> String? in
            guard let value = attributes[key]?.trimmingCharacters(in: .whitespaces), !value.isEmpty, value != "true"
            else { return nil }
            return value
        }
        let alt = words("alt")
        let desc = words("desc")
        return AnvilA11y(
            label: alt ?? prompt,
            description: desc ?? subtext ?? "",
            live: AnvilA11yRules.liveMode(attributes) ?? AnvilA11yRules.inferredLive(kind: resolved, attributes: attributes),
            hidden: AnvilA11yRules.isDecorative(attributes)
                && !AnvilA11yRules.asks(kind: resolved, attributes: attributes)
                && resolved?.isContainer != true,
            labelAuthored: alt != nil,
            descriptionAuthored: desc != nil
        )
    }
}

public extension AnvilOption {
    /// The row's accessible name: its `alt=` cell, else its title.
    var accessibleName: String {
        let alt = attributes["alt"]?.trimmingCharacters(in: .whitespaces) ?? ""
        return alt.isEmpty ? title : alt
    }
}
