import Foundation
import Testing

@testable import AnvilKit

/// SPEC 4.1.2: a live block's stamp carries every row it offered, and a
/// stamped block reads them back instead of calling the function again.
@Suite("Live rows in the stamp")
struct LiveStampTests {
    static let fence = """
    @choice id=slot query="calendar.free date=2026-11-20 minutes=30"
    ? When on Friday?
    : Both calendars are free at these times.
    - morning   | Friday morning
    - afternoon | Friday afternoon
    """

    static func rows(_ json: String) throws -> AnvilLiveRows {
        try AnvilLiveRows(JSONDecoder().decode(AnvilJSON.self, from: Data(json.utf8)))
    }

    static let slots = """
    [{"value": "1000", "label": "10:00"},
     {"value": "1030", "label": "10:30"},
     {"value": 1400, "label": "14:00", "hint": "after lunch"}]
    """

    @Test("the stamp carries the offer, byte for byte as SPEC 6.2 prints it")
    func stampMatchesSpec() throws {
        let block = try #require(AnvilParser.parse(Self.fence).blocks.first)
        let source = try #require(block.liveSource)
        let rows = try Self.rows(Self.slots).options
        let stamp = AnvilAnswer.choice(rows[1])
            .stamp(for: block, offered: AnvilLiveOffer(fn: source.fn, rows: rows), body: "I picked 10:30.")
        #expect(stamp.xml == """
        <stamp block="slot" kind="choice" value="1030" label="10:30" query="calendar.free">
          <offered value="1000" label="10:00"/>
          <offered value="1030" label="10:30"/>
          <offered value="1400" label="14:00" hint="after lunch"/>
        I picked 10:30.
        </stamp>
        """)
    }

    @Test("a stamped live block reads back exactly the rows it was shown, face included")
    func offeredRoundTrips() throws {
        let block = try #require(AnvilParser.parse(Self.fence).blocks.first)
        let rows = try Self.rows("""
        [{"value": "ed", "label": "Editorial", "img": "https://example.com/ed.jpg", "alt": "a serif page"},
         {"value": "br", "label": "Brutal", "swatch": ["#111", "#fff"], "danger": true},
         {"value": "q", "label": "say \\"hi\\"\\"/><offered value=\\"x"}]
        """).options
        let at = Date(timeIntervalSince1970: 1_800_000_000)
        let written = AnvilAnswer.choice(rows[0]).stamp(for: block, offered: AnvilLiveOffer(fn: "fonts.mood", rows: rows), at: at)
        let read = try #require(AnvilStamp.read(written.xml).stamps.first)

        #expect(read.query == "fonts.mood")
        #expect(read.at == written.at)
        let back = try #require(read.offered)
        #expect(back == rows)
        #expect(read.picked == ["ed"])
    }

    @Test("a stamp with no offer says the written rows were shown")
    func noOfferMeansWrittenRows() throws {
        let block = try #require(AnvilParser.parse(Self.fence).blocks.first)
        let plain = AnvilAnswer.choice(block.options[0]).stamp(for: block, offered: nil)
        #expect(plain == AnvilAnswer.choice(block.options[0]).stamp(for: block))
        #expect(AnvilStamp.read(plain.xml).stamps.first?.offered == nil)
    }

    @Test("a function's 1 is a number and its true is a bool")
    func jsonIsReadStrictly() throws {
        let json = try JSONDecoder().decode(AnvilJSON.self, from: Data(#"[1, true, "1", null, 2.5]"#.utf8))
        #expect(json == .array([.number(1), .bool(true), .string("1"), .null, .number(2.5)]))
    }

    @Test("the rows a function returns are warned about, never dropped in silence")
    func rowProblemsAreSaid() throws {
        let rows = try Self.rows(#"[{"label": "no value"}, {"value": "a"}, {"value": "a"}, 7]"#)
        #expect(rows.options.map(\.id) == ["a"])
        #expect(rows.warnings.count == 3)
        #expect(try Self.rows(#"{"rows": []}"#).warnings.count == 1)
    }
}
