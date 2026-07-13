package com.willcmcc.budgie.data

object ConfigParser {
    private val idPattern = Regex("^[A-Za-z0-9_-]{20,}$")
    private val urlPattern = Regex("/spreadsheets/d/([A-Za-z0-9_-]+)")

    fun sheetId(value: String): String {
        val clean = value.trim()
        val fromUrl = urlPattern.find(clean)?.groupValues?.get(1)
        val id = fromUrl ?: clean
        require(idPattern.matches(id)) { "Paste a Google Sheet link or its spreadsheet ID" }
        return id
    }

    fun column(value: String, required: Boolean): Int {
        val clean = value.trim().uppercase()
        if (clean.isBlank() && !required) return -1
        require(clean.matches(Regex("[A-Z]{1,2}"))) { "Use a column letter such as A or AA" }
        var result = 0
        clean.forEach { result = result * 26 + (it - 'A' + 1) }
        return result - 1
    }

    fun columnLabel(index: Int): String {
        if (index < 0) return ""
        var n = index + 1
        var result = ""
        while (n > 0) {
            val remainder = (n - 1) % 26
            result = ('A'.code + remainder).toChar() + result
            n = (n - 1) / 26
        }
        return result
    }
}

