package com.willcmcc.budgie.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ConfigParserTest {
    @Test
    fun `extracts id from Google Sheets url`() {
        assertEquals(
            "1abcDEF_ghijklmnopqrstuv",
            ConfigParser.sheetId("https://docs.google.com/spreadsheets/d/1abcDEF_ghijklmnopqrstuv/edit#gid=0"),
        )
    }

    @Test
    fun `accepts raw sheet id and rejects unsafe text`() {
        assertEquals("1abcDEF_ghijklmnopqrstuv", ConfigParser.sheetId("1abcDEF_ghijklmnopqrstuv"))
        assertThrows(IllegalArgumentException::class.java) { ConfigParser.sheetId("not a sheet") }
    }

    @Test
    fun `round trips column labels`() {
        listOf(0 to "A", 25 to "Z", 26 to "AA", 51 to "AZ").forEach { (index, label) ->
            assertEquals(label, ConfigParser.columnLabel(index))
            assertEquals(index, ConfigParser.column(label, required = true))
        }
        assertEquals(-1, ConfigParser.column("", required = false))
    }
}

