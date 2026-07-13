package com.willcmcc.budgie.data

import android.content.Context
import com.willcmcc.budgie.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder

class BudgieRepository(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun config(): SheetConfig? = preferences.getString(KEY_CONFIG, null)?.let { raw ->
        runCatching { configFromJson(JSONObject(raw)) }.getOrNull()
    }

    fun saveConfig(config: SheetConfig) {
        val previous = this.config()
        preferences.edit()
            .putString(KEY_CONFIG, configJson(config).toString())
            .apply {
                if (previous?.sheetId != config.sheetId || previous.transactionsTab != config.transactionsTab) {
                    remove(KEY_SNAPSHOT)
                    remove(KEY_ERROR)
                }
            }
            .apply()
    }

    fun clearConfig() {
        preferences.edit().remove(KEY_CONFIG).remove(KEY_SNAPSHOT).remove(KEY_ERROR).apply()
    }

    fun cachedSnapshot(): BudgetSnapshot = preferences.getString(KEY_SNAPSHOT, null)
        ?.let { runCatching { SheetsJsonParser.snapshot(it) }.getOrNull() }
        ?: BudgetSnapshot()

    fun lastError(): String? = preferences.getString(KEY_ERROR, null)

    fun recordError(error: Throwable) {
        preferences.edit().putString(KEY_ERROR, error.friendlyMessage()).apply()
    }

    suspend fun refresh(accessToken: String? = null): BudgetSnapshot = withContext(Dispatchers.IO) {
        val config = config() ?: error("Connect a Google Sheet first")
        val token = accessToken ?: GoogleAuthorization.token(appContext)
        val right = columnLabel(config.mapping.rightmost)
        val txRange = range(config.transactionsTab, "A${config.dataStartRow}:$right")
        val metaRange = range(config.metadataTab, "A2:B")
        val transactionsRaw = request(
            token,
            "/${config.sheetId}/values/${encode(txRange)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER",
        )
        val metadataRaw = runCatching {
            request(token, "/${config.sheetId}/values/${encode(metaRange)}")
        }.getOrElse { "{}" }
        val transactions = SheetsJsonParser.transactions(transactionsRaw, config)
        val (sheetBudget, categories) = SheetsJsonParser.metadata(metadataRaw)
        val snapshot = DashboardMath.snapshot(
            transactions = transactions,
            budget = sheetBudget ?: config.monthlyBudget,
            categories = categories ?: DefaultCategories,
        )
        preferences.edit()
            .putString(KEY_SNAPSHOT, SheetsJsonParser.snapshotJson(snapshot))
            .remove(KEY_ERROR)
            .apply()
        snapshot
    }

    suspend fun add(transaction: Transaction, accessToken: String? = null): BudgetSnapshot = withContext(Dispatchers.IO) {
        val config = config() ?: error("Connect a Google Sheet first")
        check(config.writeEnabled) { "This connection is read-only" }
        val token = accessToken ?: GoogleAuthorization.token(appContext)
        val row = MutableList<Any>(config.mapping.rightmost + 1) { "" }
        fun put(column: Int, value: Any) { if (column >= 0) row[column] = value }
        put(config.mapping.date, transaction.date)
        put(config.mapping.amount, transaction.amount)
        put(config.mapping.note, transaction.note)
        put(config.mapping.category, transaction.category)
        put(config.mapping.subcategory, transaction.subcategory)
        val right = columnLabel(config.mapping.rightmost)
        val appendRange = range(config.transactionsTab, "A:$right")
        val body = JSONObject().put("values", JSONArray().put(JSONArray(row))).toString()
        request(
            token,
            "/${config.sheetId}/values/${encode(appendRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
            "POST",
            body,
        )
        refresh(token)
    }

    private fun request(token: String, path: String, method: String = "GET", body: String? = null): String {
        val connection = URI.create("$SHEETS_BASE$path").toURL().openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 20_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("User-Agent", "Budgie-Android/${BuildConfig.VERSION_NAME}")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.bufferedWriter().use { it.write(body) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val apiMessage = runCatching {
                    JSONObject(response).optJSONObject("error")?.optString("message")
                }.getOrNull()
                error(apiMessage?.takeIf { it.isNotBlank() } ?: "Google Sheets returned HTTP $status")
            }
            response
        } finally {
            connection.disconnect()
        }
    }

    private fun range(tab: String, cells: String): String = "'${tab.replace("'", "''")}'!$cells"
    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")
    private fun columnLabel(index: Int): String = ConfigParser.columnLabel(index)

    companion object {
        private const val PREFS = "budgie_store"
        private const val KEY_CONFIG = "sheet_config"
        private const val KEY_SNAPSHOT = "snapshot"
        private const val KEY_ERROR = "last_error"
        private const val SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"

        fun friendly(error: Throwable): String = error.friendlyMessage()

        private fun Throwable.friendlyMessage(): String = when (this) {
            is AuthorizationRequiredException -> "Reconnect Google to refresh your budget"
            else -> message?.take(180) ?: "Could not refresh Budgie"
        }

        private fun configJson(config: SheetConfig) = JSONObject()
            .put("sheetId", config.sheetId)
            .put("sheetName", config.sheetName)
            .put("transactionsTab", config.transactionsTab)
            .put("metadataTab", config.metadataTab)
            .put("dataStartRow", config.dataStartRow)
            .put("writeEnabled", config.writeEnabled)
            .put("monthlyBudget", config.monthlyBudget)
            .put("mapping", JSONObject()
                .put("date", config.mapping.date)
                .put("amount", config.mapping.amount)
                .put("note", config.mapping.note)
                .put("category", config.mapping.category)
                .put("subcategory", config.mapping.subcategory))

        private fun configFromJson(root: JSONObject): SheetConfig {
            val mapping = root.optJSONObject("mapping") ?: JSONObject()
            return SheetConfig(
                sheetId = root.getString("sheetId"),
                sheetName = root.optString("sheetName", "My budget"),
                transactionsTab = root.optString("transactionsTab", "Transactions"),
                metadataTab = root.optString("metadataTab", "@metadata"),
                dataStartRow = root.optInt("dataStartRow", 2).coerceAtLeast(1),
                writeEnabled = root.optBoolean("writeEnabled", true),
                monthlyBudget = root.optDouble("monthlyBudget", 5_200.0),
                mapping = ColumnMapping(
                    date = mapping.optInt("date", 0),
                    amount = mapping.optInt("amount", 1),
                    note = mapping.optInt("note", 2),
                    category = mapping.optInt("category", 3),
                    subcategory = mapping.optInt("subcategory", 4),
                ),
            )
        }
    }
}
