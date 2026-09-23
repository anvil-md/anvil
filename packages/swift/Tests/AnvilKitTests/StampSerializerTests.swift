import Foundation
import Testing

@testable import AnvilKit

/// The one serializer, held to SPEC 6.2's own literals.
///
/// Each test parses the block the way an agent would write it (SPEC 4's
/// examples), answers it the way a human would, and compares the result to the
/// stamp SPEC 6.2 prints for it, byte for byte. The body is passed explicitly
/// because the SPEC's courtesy sentences are prose; everything else -- kind,
/// attribute order, children, escaping, masking -- is the serializer's.
@Suite("The stamp serializer matches SPEC 6.2")
struct StampSerializerTests {
    static func block(_ fence: String) throws -> AnvilDocument.Parsed {
        try #require(AnvilParser.parse(fence).blocks.first)
    }

    @Test("@choice select=one")
    func choiceOne() throws {
        let block = try Self.block("""
        @choice id=project-kind
        ? What are we actually building?
        - site    | Marketing site     | pages, no login
        - product | Product UI         | accounts, state, real users
        - !scrap  | Start from scratch | we bin the existing brand
        """)
        let stamp = AnvilAnswer.choice(block.options[1]).stamp(for: block, body: "It is a product UI.")
        #expect(stamp.xml == """
        <stamp block="project-kind" kind="choice" value="product" label="Product UI">
        It is a product UI.
        </stamp>
        """)
    }

    @Test("@gallery select=many stamps as a gallery, not a choice")
    func galleryMany() throws {
        let block = try Self.block("""
        @gallery id=mood select=many
        ? Which of these feel right?
        - ed | Editorial
        - br | Brutal
        - so | Soft
        """)
        let stamp = AnvilAnswer.choices([block.options[0], block.options[1]])
            .stamp(for: block, body: "I picked Editorial and Brutal.")
        #expect(stamp.xml == """
        <stamp block="mood" kind="gallery" values="ed,br" labels="Editorial,Brutal">
        I picked Editorial and Brutal.
        </stamp>
        """)
    }

    @Test("@input: block order, empty fields left out, the secret masked")
    func inputMasksTheSecret() throws {
        let block = try Self.block("""
        @input id=company submit="That's us"
        ? Tell me who you are
        _ legal*  | text     | Legal name      | Acme Ltd
        _ site    | url      | Current website | https://…
        _ token   | secret   | API key
        _ context | longtext | Anything I should know
        """)
        let stamp = AnvilAnswer.input(fields: ["token": "sk-live-9f8e7d", "legal": "Acme Ltd", "context": ""])
            .stamp(for: block, body: "I filled in the company details.")
        #expect(stamp.xml == """
        <stamp block="company" kind="input">
          <field name="legal">Acme Ltd</field>
          <field name="token">••••••</field>
        I filled in the company details.
        </stamp>
        """)
        #expect(!stamp.xml.contains("sk-live"), "a secret reached the transcript")
    }

    @Test("@scale")
    func scale() throws {
        let block = try Self.block("""
        @scale id=tone steps=5
        ? Set the dials
        % formal | Formal | Playful | 2
        """)
        let stamp = AnvilAnswer.scale(values: ["formal": 2]).stamp(for: block, body: "")
        #expect(stamp.xml == """
        <stamp block="tone" kind="scale" steps="5">
          <dial name="formal" value="2" norm="0.25" poles="Formal|Playful"/>
        </stamp>
        """)
    }

    @Test("@scale with two dials takes an untouched dial's default")
    func scaleTwoDials() throws {
        let block = try Self.block("""
        @scale id=tone steps=5
        ? Set the dials
        % formal | Formal | Playful | 2
        % dense  | Dense  | Airy    | 3
        """)
        let stamp = AnvilAnswer.scale(values: ["formal": 5]).stamp(for: block)
        #expect(stamp.children.map { $0.attribute("value") } == ["5", "3"])
        #expect(stamp.children.map { $0.attribute("norm") } == ["1", "0.5"])
    }

    static let gdrive = """
    @connect id=gdrive provider=google-drive submit=Connect
    ? Connect Google Drive
    : So I can read Products and Brand
    - drive.readonly | Read your files       | never write, never delete
    - drive.metadata | See file names
    - !drive.file    | Create and edit files | I can overwrite what I make
    """

    @Test("@connect connected")
    func connectConnected() throws {
        let block = try Self.block(Self.gdrive)
        let at = try Date("2026-09-23T14:02:00Z", strategy: .iso8601)
        let stamp = AnvilAnswer.connect(state: "connected", granted: ["drive.readonly", "drive.metadata"], account: nil)
            .stamp(for: block, at: at, by: "Jonas", body: "I connected Google Drive.")
        #expect(stamp.xml == """
        <stamp block="gdrive" kind="connect" state="connected" provider="google-drive" \
        values="drive.readonly,drive.metadata" labels="Read your files,See file names" \
        at="2026-09-23T14:02:00Z" by="Jonas">
        I connected Google Drive.
        </stamp>
        """)
    }

    @Test("@connect partial names the refused scope")
    func connectPartial() throws {
        let block = try Self.block(Self.gdrive)
        let stamp = AnvilAnswer.connect(state: "partial", granted: ["drive.readonly", "drive.metadata"], account: nil)
            .stamp(for: block)
        #expect(stamp.attribute("state") == "partial")
        #expect(stamp.attribute("values") == "drive.readonly,drive.metadata")
        #expect(stamp.attribute("labels") == "Read your files,See file names")
        #expect(stamp.attribute("refused") == "drive.file")
    }

    @Test("@connect declined")
    func connectDeclined() throws {
        let block = try Self.block(Self.gdrive)
        let stamp = AnvilAnswer.connect(state: "declined", granted: [], account: nil)
            .stamp(for: block, body: "I would rather not connect that.")
        #expect(stamp.xml == """
        <stamp block="gdrive" kind="connect" state="declined" provider="google-drive">
        I would rather not connect that.
        </stamp>
        """)
    }

    @Test("one escaping policy: attributes, field text and body")
    func escapesEverything() throws {
        let block = try Self.block("""
        @input id=x
        _ note | text
        """)
        let stamp = AnvilAnswer.input(fields: ["note": "a</field><field name=\"y\">b & \"c\""])
            .stamp(for: block, by: "Ana \"the\" <boss>", body: "Tom & <Jerry>")
        #expect(stamp.xml.contains("<field name=\"note\">a&lt;/field&gt;&lt;field name=&quot;y&quot;&gt;b &amp; &quot;c&quot;</field>"))
        #expect(stamp.xml.contains("by=\"Ana &quot;the&quot; &lt;boss&gt;\""))
        #expect(stamp.xml.contains("Tom &amp; &lt;Jerry&gt;"))
    }

    @Test("at= is ISO 8601, by= only when given")
    func atAndBy() throws {
        let block = try Self.block("@choice id=a\n- x | X")
        let at = try Date("2026-09-23T07:02:11Z", strategy: .iso8601)
        let with = AnvilAnswer.choice(block.options[0]).stamp(for: block, at: at, by: "Marcus")
        #expect(with.at == "2026-09-23T07:02:11Z")
        #expect(with.date == at)
        #expect(with.by == "Marcus")
        let without = AnvilAnswer.choice(block.options[0]).stamp(for: block)
        #expect(without.at == nil)
        #expect(without.by == nil)
    }

    @Test("every default courtesy sentence is a sentence")
    func defaultBodies() throws {
        let choice = try Self.block("@choice id=a\n- x | Ship it")
        #expect(AnvilAnswer.choice(choice.options[0]).stamp(for: choice).body == "I picked Ship it.")
        let scale = try Self.block("@scale id=s\n% firm | Loose | Locked | 4")
        #expect(AnvilAnswer.scale(values: [:]).stamp(for: scale).body == "I set firm to 4 of 5.")
    }
}
