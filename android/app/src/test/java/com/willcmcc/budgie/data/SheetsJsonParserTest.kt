package com.willcmcc.budgie.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class SheetsJsonParserTest {
    @Test
    fun `parses mapped rows and skips malformed rows`() {
        val config = SheetConfig(
            sheetId = "1abcDEF_ghijklmnopqrstuv",
            dataStartRow = 3,
            mapping = ColumnMapping(date = 2, amount = 0, note = 4, category = 1, subcategory = -1),
        )
        val raw = """{
          "values": [
            [12.5, "Drinks", 46205, "ignored", "Coffee"],
            ["bad", "Other", "not-a-date"],
            ["$1,234.50", "Travel", "2026-07-13", "", "Hotel"]
          ]
        }"""

        val result = SheetsJsonParser.transactions(raw, config)
        assertEquals(2, result.size)
        assertEquals("2026-07-02", result[0].date)
        assertEquals(3, result[0].row)
        assertEquals(1234.50, result[1].amount, 0.001)
        assertEquals("Travel", result[1].category)
        assertEquals(5, result[1].row)
    }

    @Test
    fun `reads web app metadata and round trips cache`() {
        val raw = """{"values":[["budget","4200"],["categories","[{\"name\":\"Pets\",\"icon\":\"🐾\",\"color\":\"#fff\"}]"]]}"""
        val (budget, categories) = SheetsJsonParser.metadata(raw)
        assertEquals(4_200.0, budget!!, 0.001)
        assertEquals("Pets", categories?.single()?.name)

        val snapshot = DashboardMath.snapshot(
            listOf(Transaction("2026-07-13", 12.0, "Treats", "Pets", row = 8)),
            4_200.0,
            categories!!,
            java.time.LocalDate.of(2026, 7, 13),
            999L,
        )
        val restored = SheetsJsonParser.snapshot(SheetsJsonParser.snapshotJson(snapshot))
        assertEquals(snapshot, restored)
        assertNotNull(restored.transactions.single().row)
    }
}

