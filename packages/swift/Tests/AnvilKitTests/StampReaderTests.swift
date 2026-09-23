import Foundation
import Testing

@testable import AnvilKit

/// Reading stamps back out of a transcript. The inverse of the serializer,
/// and total: hostile text degrades to prose, it never throws or half-reads.
@Suite("Stamps read back out of a turn")
struct StampReaderTests {
    static let company = """
    @input id=company
    _ legal* | text | Legal name
    _ token  | secret | API key
    """

    @Test("what the serializer writes, the reader reads back unchanged")
    func roundTrip() throws {
        let input = try #require(AnvilParser.parse(Self.company).blocks.first)
        let scale = try #require(AnvilParser.parse("@scale id=tone\n% formal | Formal | Playful | 2").blocks.first)
        let at = try Date("2026-09-23T07:02:11Z", strategy: .iso8601)
        let stamps = [
            AnvilAnswer.input(fields: ["legal": "Acme & \"Sons\" <Ltd>", "token": "secret"])
                .stamp(for: input, at: at, by: "Ana"),
            AnvilAnswer.scale(values: ["formal": 4]).stamp(for: scale),
        ]
        for stamp in stamps {
            let read = AnvilStamp.read(stamp.xml)
            #expect(read.stamps == [stamp])
            #expect(read.isOnlyStamps)
        }
    }

    @Test("reads SPEC 6.2's own literal")
    func readsTheSpec() throws {
        let read = AnvilStamp.read("""
        <stamp block="company" kind="input">
          <field name="legal">Acme Ltd</field>
          <field name="token">••••••</field>
        I filled in the company details.
        </stamp>
        """)
        let stamp = try #require(read.stamps.first)
        #expect(stamp.block == "company")
        #expect(stamp.kind == "input")
        #expect(stamp.children.map { $0.attribute("name") } == ["legal", "token"])
        #expect(stamp.children.map(\.text) == ["Acme Ltd", "••••••"])
        #expect(stamp.body == "I filled in the company details.")
    }

    @Test("prose around stamps is kept, several stamps in touch order")
    func mixedTurn() {
        let read = AnvilStamp.read("""
        Going with this, and Lisa agrees.
        <stamp block="a" kind="choice" value="x" label="X">I picked X.</stamp>
        <stamp block="b" kind="choice" value="y" label="Y">I picked Y.</stamp>
        """)
        #expect(read.stamps.map(\.block) == ["a", "b"])
        #expect(read.prose == "Going with this, and Lisa agrees.")
        #expect(!read.isOnlyStamps)
    }

    @Test("a turn with no stamps is all prose")
    func noStamps() {
        let read = AnvilStamp.read("  just words  ")
        #expect(read.stamps.isEmpty)
        #expect(read.prose == "just words")
    }

    /// Untrusted text (SPEC 8.1). Every one of these must come back as prose,
    /// with no stamp invented from half a tag.
    @Test("a malformed tag is prose, never half a stamp", arguments: [
        "<stamp block=\"a\" kind=\"choice\" value=\"x\">no close",
        "<stamp kind=\"choice\" value=\"x\">no block</stamp>",
        "<stamp block=\"a\" value=\"x\">no kind</stamp>",
        "<stamp block=\"a kind=\"choice\">unbalanced</stamp>",
        "<stamps block=\"a\" kind=\"choice\">wrong tag</stamps>",
        "<stamp block=a kind=choice>unquoted</stamp>",
        "<stamp",
        "<stamp block=\"",
    ])
    func malformedIsProse(_ text: String) {
        let read = AnvilStamp.read(text)
        #expect(read.stamps.isEmpty, "read a stamp out of: \(text)")
        #expect(!read.prose.isEmpty)
    }

    @Test("the reader survives every prefix of a real stamp")
    func total() throws {
        let block = try #require(AnvilParser.parse(Self.company).blocks.first)
        let xml = AnvilAnswer.input(fields: ["legal": "Acme"]).stamp(for: block, by: "Ana").xml
        for end in xml.indices {
            _ = AnvilStamp.read(String(xml[..<end]))
        }
    }
}
