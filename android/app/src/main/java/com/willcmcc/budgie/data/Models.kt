package com.willcmcc.budgie.data

import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.roundToInt

data class ColumnMapping(
    val date: Int = 0,
    val amount: Int = 1,
    val note: Int = 2,
    val category: Int = 3,
    val subcategory: Int = 4,
) {
    val rightmost: Int get() = listOf(date, amount, note, category, subcategory).filter { it >= 0 }.maxOrNull() ?: 0
}

data class SheetConfig(
    val sheetId: String,
    val sheetName: String = "My budget",
    val transactionsTab: String = "Transactions",
    val metadataTab: String = "@metadata",
    val dataStartRow: Int = 2,
    val writeEnabled: Boolean = true,
    val monthlyBudget: Double = 5_200.0,
    val mapping: ColumnMapping = ColumnMapping(),
)

data class Transaction(
    val date: String,
    val amount: Double,
    val note: String,
    val category: String,
    val subcategory: String = "",
    val row: Int? = null,
)

data class Category(
    val name: String,
    val icon: String,
    val color: String,
)

val DefaultCategories = listOf(
    Category("Groceries", "🛒", "#F5F0EB"),
    Category("Eat out", "🍽️", "#F5EDED"),
    Category("Drinks", "🍺", "#EDF2F8"),
    Category("Household", "🏠", "#EDF5ED"),
    Category("Transport", "🚇", "#EDEDF8"),
    Category("Health", "💊", "#F5EDF2"),
    Category("Other", "💸", "#F2F2F2"),
)

data class BudgetSnapshot(
    val budget: Double = 0.0,
    val spent: Double = 0.0,
    val left: Double = 0.0,
    val targetToDate: Double = 0.0,
    val forecast: Double = 0.0,
    val dailyTarget: Double = 0.0,
    val recentDailyAverage: Double = 0.0,
    val onTrack: Boolean = true,
    val transactions: List<Transaction> = emptyList(),
    val categories: List<Category> = DefaultCategories,
    val updatedAt: Long = 0L,
) {
    val budgetProgress: Int
        get() = if (budget <= 0) 0 else ((spent / budget) * 100).roundToInt().coerceIn(0, 100)
}

object DashboardMath {
    fun snapshot(
        transactions: List<Transaction>,
        budget: Double,
        categories: List<Category> = DefaultCategories,
        today: LocalDate = LocalDate.now(),
        updatedAt: Long = System.currentTimeMillis(),
    ): BudgetSnapshot {
        val month = YearMonth.from(today)
        val inMonth = transactions.filter { tx ->
            runCatching { YearMonth.from(LocalDate.parse(tx.date)) == month }.getOrDefault(false)
        }
        val spent = inMonth.filter { LocalDate.parse(it.date) <= today }.sumOf { it.amount }.roundMoney()
        val daysInMonth = month.lengthOfMonth()
        val todayDay = today.dayOfMonth
        val dailyTarget = (budget / daysInMonth).roundMoney()
        val target = (dailyTarget * todayDay).roundMoney()
        val lastSevenStart = today.minusDays(6)
        val recentSpend = inMonth.filter {
            val date = LocalDate.parse(it.date)
            !date.isBefore(lastSevenStart) && !date.isAfter(today)
        }.sumOf { it.amount }
        val daysObserved = minOf(7, todayDay).coerceAtLeast(1)
        val recentAverage = (recentSpend / daysObserved).roundMoney()
        val monthAverage = (spent / todayDay.coerceAtLeast(1)).roundMoney()
        val blended = if (todayDay > 7) (recentAverage * .5 + monthAverage * .5) else recentAverage
        val forecast = (spent + blended * (daysInMonth - todayDay)).roundMoney()
        return BudgetSnapshot(
            budget = budget.roundMoney(),
            spent = spent,
            left = (budget - spent).roundMoney(),
            targetToDate = target,
            forecast = forecast,
            dailyTarget = dailyTarget,
            recentDailyAverage = recentAverage,
            onTrack = blended <= dailyTarget,
            transactions = transactions.sortedWith(compareByDescending<Transaction> { it.date }.thenByDescending { it.row ?: 0 }),
            categories = categories.ifEmpty { DefaultCategories },
            updatedAt = updatedAt,
        )
    }

    private fun Double.roundMoney(): Double = (this * 100).roundToInt() / 100.0
}

