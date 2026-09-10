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
/// Each case maps to one stamp shape in SPEC section 6.2.
public enum AnvilAnswer: Sendable {
    /// `@choice select=one`
    case choice(AnvilOption)
    /// `@choice select=many`, `@gallery`
    case choices([AnvilOption])
    /// `@scale`
    case scale(name: String, value: Int, steps: Int, poles: String)
    /// `@input`
    case input(fields: [String: String])
    /// `@connect`. The grant, not the click.
    case connect(provider: String, granted: [AnvilOption], account: String?)

    /// The option ids this answer picked, for driving a block's stamped state.
    public var pickedIDs: Set<String> {
        switch self {
        case let .choice(option): [option.id]
        case let .choices(options): Set(options.map(\.id))
        case let .scale(_, value, _, _): ["\(value)"]
        case .input: []
        case let .connect(_, granted, _): Set(granted.map(\.id))
        }
    }

    /// The stamp this answer sends back.
    public func stamp(block: String) -> AnvilStamp {
        switch self {
        case let .choice(option):
            .choice(block: block, option: option)
        case let .choices(options):
            .choice(block: block, options: options)
        case let .scale(name, value, steps, poles):
            .scale(block: block, name: name, value: value, steps: steps, poles: poles)
        case let .input(fields):
            .input(block: block, fields: fields.sorted { $0.key < $1.key }.map { ($0.key, $0.value) })
        case let .connect(provider, granted, account):
            .connect(block: block, provider: provider, granted: granted, account: account)
        }
    }
}
