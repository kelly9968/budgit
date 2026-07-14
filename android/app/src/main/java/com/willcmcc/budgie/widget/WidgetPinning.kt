package com.willcmcc.budgie.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

object WidgetPinning {
    fun requestPace(context: Context): Boolean = request(context, PaceWidgetProvider::class.java)
    fun requestRecent(context: Context): Boolean = request(context, RecentWidgetProvider::class.java)

    private fun request(context: Context, provider: Class<*>): Boolean {
        val manager = AppWidgetManager.getInstance(context)
        if (!manager.isRequestPinAppWidgetSupported) return false
        return manager.requestPinAppWidget(ComponentName(context, provider), null, null)
    }
}

