package com.willcmcc.budgie.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class DashboardMathTest {
    @Test
    fun `computes month pace from current month only`() {
        val result = DashboardMath.snapshot(
            transactions = listOf(
                Transaction("2026-07-01", 100.0, "Market", "Groceries"),
                Transaction("2026-07-10", 40.0, "Train", "Transport"),
                Transaction("2026-06-30", 999.0, "Old", "Other"),
                Transaction("2026-07-14", 500.0, "Future", "Other"),
            ),
            budget = 3_100.0,
            today = LocalDate.of(2026, 7, 13),
            updatedAt = 123L,
        )

        assertEquals(140.0, result.spent, 0.001)
        assertEquals(2_960.0, result.left, 0.001)
        assertEquals(100.0, result.dailyTarget, 0.001)
        assertEquals(1_300.0, result.targetToDate, 0.001)
        assertTrue(result.onTrack)
        assertEquals(123L, result.updatedAt)
    }

    @Test
    fun `flags a pace above the daily budget`() {
        val result = DashboardMath.snapshot(
            transactions = listOf(Transaction("2026-07-13", 1_000.0, "Trip", "Other")),
            budget = 310.0,
            today = LocalDate.of(2026, 7, 13),
        )
        assertFalse(result.onTrack)
        assertEquals(100, result.budgetProgress)
    }
}

