import Foundation

/// What a human did to a block.
///
/// The renderer used to hand back a bare `AnvilOption`, which works for
/// `@choice` and is wrong for everything else: a `@scale` has no option, a
/// `@input` has fields, and a `@connect` has a set of granted scopes. Forcing
/// them all through one shape meant a scale either could not report at all --
/// which is the bug this type exists to fix -- or reported itself on the wire
/// as `kind="choice"`, which is a lie.
///
/// An answer is turned into a stamp WITH the block it answers
/// (`stamp(for:)`), because the block knows things the answer must not be
/// trusted to carry: its kind (a `@gallery` stamps as `gallery`), its field
/// order and which of those fields is a secret, its steps and poles.
public enum AnvilAnswer: Sendable, Equatable {
    /// `@choice` / `@gallery`, `select=one`.
    case choice(AnvilOption)
    /// `@choice` / `@gallery`, `select=many`.
    case choices([AnvilOption])
    /// `@scale`: a notch (1-based) per dial name.
    case scale(values: [String: Int])
    /// `@input`: a value per field name. Secrets are masked by the stamp,
    /// not by the caller.
    case input(fields: [String: String])
    /// `@connect`. The grant, not the click: written when the provider's
    /// consent screen answers (SPEC 4.18.3). `granted` are scope ids.
    case connect(state: String, granted: [String], account: String?)

    /// The option ids this answer picked, for driving a block's stamped state.
    public var pickedIDs: Set<String> {
        switch self {
        case let .choice(option): [option.id]
        case let .choices(options): Set(options.map(\.id))
        case let .scale(values): Set(values.values.map(String.init))
        case .input: []
        case let .connect(_, granted, _): Set(granted)
        }
    }
}
