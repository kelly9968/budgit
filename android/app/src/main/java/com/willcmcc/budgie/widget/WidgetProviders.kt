package com.willcmcc.budgie.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

abstract class BaseWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids)
        WidgetRefreshWorker.schedule(context)
        WidgetRefreshWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        WidgetRefreshWorker.schedule(context)
        WidgetRefreshWorker.refreshNow(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            WidgetUpdater.updateAll(context, refreshing = true)
            WidgetRefreshWorker.refreshNow(context)
        }
    }

    abstract fun render(context: Context, manager: AppWidgetManager, ids: IntArray)

    companion object {
        const val ACTION_REFRESH = "com.willcmcc.budgie.action.REFRESH_WIDGETS"
    }
}

class PaceWidgetProvider : BaseWidgetProvider() {
    override fun render(context: Context, manager: AppWidgetManager, ids: IntArray) =
        WidgetUpdater.updatePace(context, manager, ids)
}

class RecentWidgetProvider : BaseWidgetProvider() {
    override fun render(context: Context, manager: AppWidgetManager, ids: IntArray) =
        WidgetUpdater.updateRecent(context, manager, ids)
}

