import Testing

@testable import AnvilKit

/// SPEC 11: a block with no `id=` gets one from its content, stable across
/// reloads, never from its position. And it must be the reference parser's
/// id, because it is the `block=` another client's stamp will carry.
@Suite("Derived ids")
struct DerivedIdTests {
    /// Each expected id was printed by `packages/parser` (`parseAnvil`) on
    /// 2026-09-23. If the reference derivation ever changes, these break, and
    /// they should. Only kinds the reference parser knows: it has no `@code`,
    /// `@connect`, `@void`, `@upload`, `@link`, `@order` or `@example` yet and
    /// reads each as an unknown note, so their ids cannot agree.
    @Test("the id is the reference parser's id", arguments: [
        ("@choice\n? Where?\n- prod | Production\n- stage | Staging", "ad3815764"),
        ("@choice\n? Where?\n\n# a comment\n-   prod   |  Production\n- stage | Staging", "ad3815764"),
        ("@scale steps=5\n? Set the dials\n% formal | Formal | Playful | 2", "add2366d8"),
        ("@note tone=warn\n> Staging shares the **production** database.", "a79f490a7"),
        ("@gallery render=swatch\n? Which palette?\n- ink | Ink and paper | warm | swatch=#111111,#f5f2ea", "ad18fc18a"),
        ("@input\n? Tell me — who?\n_ legal* | text | Legal name", "a99a7c12b"),
    ])
    func matchesReference(_ source: String, _ expected: String) throws {
        let block = try #require(AnvilParser.parse(source).blocks.first)
        #expect(block.id == expected)
        #expect(block.derivedId)
    }

    /// The bug this replaced: every id-less `@choice` was the block `choice`,
    /// so answering one answered all of them.
    @Test("two different id-less blocks of one kind are two blocks")
    func distinct() {
        let blocks = AnvilParser.parse("@choice\n? A?\n- a | A\n@choice\n? B?\n- b | B").blocks
        #expect(blocks.count == 2)
        #expect(blocks[0].id != blocks[1].id)
    }

    @Test("an authored id is used as written")
    func authored() throws {
        let block = try #require(AnvilParser.parse("@choice id=deploy\n- a | A").blocks.first)
        #expect(block.id == "deploy")
        #expect(!block.derivedId)
    }
}
