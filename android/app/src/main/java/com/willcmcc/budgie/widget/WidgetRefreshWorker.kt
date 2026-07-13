package com.willcmcc.budgie.widget

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.willcmcc.budgie.data.AuthorizationRequiredException
import com.willcmcc.budgie.data.BudgieRepository
import java.util.concurrent.TimeUnit

class WidgetRefreshWorker(context: Context, parameters: WorkerParameters) :
    CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val repository = BudgieRepository(applicationContext)
        if (repository.config() == null) {
            WidgetUpdater.updateAll(applicationContext)
            return Result.success()
        }
        return runCatching { repository.refresh() }
            .fold(
                onSuccess = {
                    WidgetUpdater.updateAll(applicationContext)
                    Result.success()
                },
                onFailure = {
                    repository.recordError(it)
                    WidgetUpdater.updateAll(applicationContext)
                    if (it is AuthorizationRequiredException) Result.success()
                    else if (runAttemptCount < 2) Result.retry() else Result.success()
                },
            )
    }

    companion object {
        private const val PERIODIC_NAME = "budgie-widget-periodic"
        private const val ON_DEMAND_NAME = "budgie-widget-now"

        private val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
        }

        fun refreshNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<WidgetRefreshWorker>()
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                ON_DEMAND_NAME,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}

