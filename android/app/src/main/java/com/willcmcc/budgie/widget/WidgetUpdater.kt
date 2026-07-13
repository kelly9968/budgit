package com.willcmcc.budgie.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import com.willcmcc.budgie.MainActivity
import com.willcmcc.budgie.R
import com.willcmcc.budgie.data.BudgieRepository
import com.willcmcc.budgie.ui.formatCurrency
import java.text.DateFormat
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Date

object WidgetUpdater {
    fun updateAll(context: Context, refreshing: Boolean = false) {
        val manager = AppWidgetManager.getInstance(context)
        val paceIds = manager.getAppWidgetIds(ComponentName(context, PaceWidgetProvider::class.java))
        val recentIds = manager.getAppWidgetIds(ComponentName(context, RecentWidgetProvider::class.java))
        if (paceIds.isNotEmpty()) updatePace(context, manager, paceIds, refreshing)
        if (recentIds.isNotEmpty()) updateRecent(context, manager, recentIds, refreshing)
    }

    fun updatePace(
        context: Context,
        manager: AppWidgetManager,
        ids: IntArray,
        refreshing: Boolean = false,
    ) {
        val repository = BudgieRepository(context)
        val config = repository.config()
        val snapshot = repository.cachedSnapshot()
        val error = repository.lastError()
        ids.forEach { id ->
            val views = RemoteViews(context.packageName, R.layout.widget_pace)
            views.setOnClickPendingIntent(R.id.widget_root, openApp(context, MainActivity.SCREEN_DASHBOARD, id))
            views.setOnClickPendingIntent(R.id.widget_refresh, refresh(context, PaceWidgetProvider::class.java, id))
            views.setTextViewText(R.id.pace_month, YearMonth.now().format(DateTimeFormatter.ofPattern("MMM yyyy")).uppercase())
            views.setTextViewText(R.id.pace_spent, if (snapshot.updatedAt > 0) formatCurrency(snapshot.spent, 0) else "—")
            views.setTextViewText(R.id.pace_left, if (snapshot.updatedAt > 0) "${formatCurrency(snapshot.left, 0)} left" else "Open Budgie")
            views.setTextViewText(R.id.pace_budget, if (snapshot.updatedAt > 0) "Budget ${formatCurrency(snapshot.budget, 0)}" else "Your month at a glance")
            views.setTextViewText(R.id.pace_status, if (snapshot.onTrack) "ON TRACK" else "OVER PACE")
            views.setTextColor(R.id.pace_status, if (snapshot.onTrack) 0xFF6B8C4A.toInt() else 0xFFC25B3F.toInt())
            views.setProgressBar(R.id.pace_progress, 100, snapshot.budgetProgress, snapshot.updatedAt == 0L)
            views.setTextViewText(R.id.widget_updated, status(config != null, snapshot.updatedAt, error, refreshing))
            manager.updateAppWidget(id, views)
        }
    }

    fun updateRecent(
        context: Context,
        manager: AppWidgetManager,
        ids: IntArray,
        refreshing: Boolean = false,
    ) {
        val repository = BudgieRepository(context)
        val config = repository.config()
        val snapshot = repository.cachedSnapshot()
        val error = repository.lastError()
        val rowIds = listOf(R.id.recent_row_1, R.id.recent_row_2, R.id.recent_row_3)
        val noteIds = listOf(R.id.recent_note_1, R.id.recent_note_2, R.id.recent_note_3)
        val amountIds = listOf(R.id.recent_amount_1, R.id.recent_amount_2, R.id.recent_amount_3)
        ids.forEach { id ->
            val views = RemoteViews(context.packageName, R.layout.widget_recent)
            views.setOnClickPendingIntent(R.id.widget_root, openApp(context, MainActivity.SCREEN_ACTIVITY, id))
            views.setOnClickPendingIntent(R.id.widget_add, openApp(context, MainActivity.SCREEN_ADD, id + 1000))
            views.setOnClickPendingIntent(R.id.widget_refresh, refresh(context, RecentWidgetProvider::class.java, id))
            rowIds.forEachIndexed { index, rowId ->
                val transaction = snapshot.transactions.getOrNull(index)
                views.setViewVisibility(rowId, if (transaction == null && index > 0) View.GONE else View.VISIBLE)
                if (transaction != null) {
                    val label = transaction.note.ifBlank { transaction.category }
                    views.setTextViewText(noteIds[index], "$label  ·  ${transaction.category}")
                    views.setTextViewText(amountIds[index], formatCurrency(transaction.amount))
                } else if (index == 0) {
                    views.setTextViewText(noteIds[index], if (config == null) "Tap to connect a Sheet" else "No expenses yet")
                    views.setTextViewText(amountIds[index], "")
                }
            }
            views.setTextViewText(R.id.widget_updated, status(config != null, snapshot.updatedAt, error, refreshing))
            manager.updateAppWidget(id, views)
        }
    }

    private fun status(configured: Boolean, updatedAt: Long, error: String?, refreshing: Boolean): String = when {
        !configured -> "TAP TO CONNECT"
        refreshing -> "REFRESHING…"
        updatedAt <= 0L && error != null -> "CONNECT GOOGLE IN APP"
        updatedAt <= 0L -> "WAITING FOR FIRST SYNC"
        error != null -> "OFFLINE · ${updatedTime(updatedAt)}"
        else -> "UPDATED ${updatedTime(updatedAt)}"
    }

    private fun updatedTime(timestamp: Long): String = DateFormat.getTimeInstance(DateFormat.SHORT)
        .format(Date(timestamp)).uppercase()

    private fun openApp(context: Context, screen: String, id: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .putExtra(MainActivity.EXTRA_SCREEN, screen)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(
            context,
            id * 10 + screen.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun refresh(context: Context, provider: Class<*>, id: Int): PendingIntent {
        val intent = Intent(context, provider).setAction(BaseWidgetProvider.ACTION_REFRESH)
        return PendingIntent.getBroadcast(
            context,
            id * 100 + provider.name.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
