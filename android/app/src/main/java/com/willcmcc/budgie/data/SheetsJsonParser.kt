package com.willcmcc.budgie.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

object SheetsJsonParser {
    fun transactions(raw: String, config: SheetConfig): List<Transaction> {
        val values = JSONObject(raw).optJSONArray("values") ?: JSONArray()
        return buildList {
            for (i in 0 until values.length()) {
                val row = values.optJSONArray(i) ?: continue
                parseTransaction(row, config.mapping, config.dataStartRow + i)?.let(::add)
            }
        }
    }

    fun metadata(raw: String): Pair<Double?, List<Category>?> {
        val values = JSONObject(raw).optJSONArray("values") ?: return null to null
        var budget: Double? = null
        var categories: List<Category>? = null
        for (i in 0 until values.length()) {
            val row = values.optJSONArray(i) ?: continue
            when (row.optString(0)) {
                "budget" -> budget = row.optString(1).toDoubleOrNull()
                "categories" -> categories = parseCategories(row.optString(1))
            }
        }
        return budget to categories
    }

    fun snapshot(raw: String): BudgetSnapshot {
        val root = JSONObject(raw)
        val txs = mutableListOf<Transaction>()
        val rows = root.optJSONArray("transactions") ?: JSONArray()
        for (i in 0 until rows.length()) {
            val item = rows.getJSONObject(i)
            txs += Transaction(
                date = item.getString("date"),
                amount = item.getDouble("amount"),
                note = item.optString("note"),
                category = item.optString("category", "Other"),
                subcategory = item.optString("subcategory"),
                row = item.optInt("row").takeIf { it > 0 },
            )
        }
        val categories = parseCategories(root.optJSONArray("categories")?.toString().orEmpty()) ?: DefaultCategories
        return BudgetSnapshot(
            budget = root.optDouble("budget"),
            spent = root.optDouble("spent"),
            left = root.optDouble("left"),
            targetToDate = root.optDouble("targetToDate"),
            forecast = root.optDouble("forecast"),
            dailyTarget = root.optDouble("dailyTarget"),
            recentDailyAverage = root.optDouble("recentDailyAverage"),
            onTrack = root.optBoolean("onTrack", true),
            transactions = txs,
            categories = categories,
            updatedAt = root.optLong("updatedAt"),
        )
    }

    fun snapshotJson(snapshot: BudgetSnapshot): String = JSONObject()
        .put("budget", snapshot.budget)
        .put("spent", snapshot.spent)
        .put("left", snapshot.left)
        .put("targetToDate", snapshot.targetToDate)
        .put("forecast", snapshot.forecast)
        .put("dailyTarget", snapshot.dailyTarget)
        .put("recentDailyAverage", snapshot.recentDailyAverage)
        .put("onTrack", snapshot.onTrack)
        .put("updatedAt", snapshot.updatedAt)
        .put("categories", JSONArray(snapshot.categories.map { categoryJson(it) }))
        .put("transactions", JSONArray(snapshot.transactions.map { transactionJson(it) }))
        .toString()

    private fun parseTransaction(row: JSONArray, mapping: ColumnMapping, rowNumber: Int): Transaction? {
        val date = normalizeDate(row.opt(mapping.date)) ?: return null
        val amount = normalizeAmount(row.opt(mapping.amount)) ?: return null
        fun text(index: Int): String = if (index < 0) "" else row.optString(index)
        return Transaction(
            date = date,
            amount = amount,
            note = text(mapping.note),
            category = text(mapping.category).ifBlank { "Other" },
            subcategory = text(mapping.subcategory),
            row = rowNumber,
        )
    }

    private fun normalizeDate(value: Any?): String? = when (value) {
        is Number -> LocalDate.of(1899, 12, 30).plusDays(value.toLong()).toString()
        is String -> runCatching { LocalDate.parse(value.take(10)) }.getOrNull()?.toString()
        else -> null
    }

    private fun normalizeAmount(value: Any?): Double? {
        val amount = when (value) {
            is Number -> value.toDouble()
            is String -> value.replace(Regex("[$,\\s]"), "").toDoubleOrNull()
            else -> null
        }
        return amount?.takeIf { it.isFinite() && it > 0 }
    }

    private fun parseCategories(raw: String): List<Category>? = runCatching {
        val array = JSONArray(raw)
        buildList {
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                add(Category(item.getString("name"), item.optString("icon", "💸"), item.optString("color", "#F2F2F2")))
            }
        }.takeIf { it.isNotEmpty() }
    }.getOrNull()

    private fun categoryJson(category: Category) = JSONObject()
        .put("name", category.name).put("icon", category.icon).put("color", category.color)

    private fun transactionJson(tx: Transaction) = JSONObject()
        .put("date", tx.date).put("amount", tx.amount).put("note", tx.note)
        .put("category", tx.category).put("subcategory", tx.subcategory).put("row", tx.row)
}

