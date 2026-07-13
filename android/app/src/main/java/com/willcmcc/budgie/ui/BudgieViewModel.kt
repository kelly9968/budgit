package com.willcmcc.budgie.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import com.willcmcc.budgie.data.AuthorizationRequiredException
import com.willcmcc.budgie.data.BudgetSnapshot
import com.willcmcc.budgie.data.BudgieRepository
import com.willcmcc.budgie.data.SheetConfig
import com.willcmcc.budgie.data.Transaction
import com.willcmcc.budgie.widget.WidgetRefreshWorker
import com.willcmcc.budgie.widget.WidgetUpdater
import kotlinx.coroutines.launch

enum class AppScreen { DASHBOARD, ADD, ACTIVITY, SETTINGS }

data class BudgieUiState(
    val config: SheetConfig? = null,
    val snapshot: BudgetSnapshot = BudgetSnapshot(),
    val screen: AppScreen = AppScreen.DASHBOARD,
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val authorizing: Boolean = false,
    val authRequired: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val accountEmail: String? = null,
)

class BudgieViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = BudgieRepository(application)

    var state by androidx.compose.runtime.mutableStateOf(
        BudgieUiState(
            config = repository.config(),
            snapshot = repository.cachedSnapshot(),
            error = repository.lastError(),
        ),
    )
        private set

    init {
        WidgetRefreshWorker.schedule(application)
        if (state.config != null) refresh(initial = state.snapshot.updatedAt == 0L)
    }

    fun navigate(screen: AppScreen) {
        state = state.copy(screen = screen)
    }

    fun saveConfig(config: SheetConfig) {
        repository.saveConfig(config)
        state = state.copy(config = config, screen = AppScreen.DASHBOARD, error = null, notice = "Sheet connection saved")
        refresh(initial = state.snapshot.updatedAt == 0L)
        WidgetUpdater.updateAll(getApplication())
    }

    fun disconnect() {
        repository.clearConfig()
        state = BudgieUiState()
        WidgetUpdater.updateAll(getApplication())
    }

    fun refresh(initial: Boolean = false, token: String? = null) {
        if (state.config == null) return
        viewModelScope.launch {
            state = state.copy(loading = initial, refreshing = !initial, error = null)
            runCatching { repository.refresh(token) }
                .onSuccess {
                    state = state.copy(
                        snapshot = it,
                        loading = false,
                        refreshing = false,
                        authRequired = false,
                        error = null,
                        notice = if (!initial) "Budget refreshed" else state.notice,
                    )
                    WidgetUpdater.updateAll(getApplication())
                }
                .onFailure(::handleFailure)
        }
    }

    fun add(transaction: Transaction, token: String? = null) {
        viewModelScope.launch {
            state = state.copy(refreshing = true, error = null)
            runCatching { repository.add(transaction, token) }
                .onSuccess {
                    state = state.copy(
                        snapshot = it,
                        screen = AppScreen.DASHBOARD,
                        refreshing = false,
                        authRequired = false,
                        notice = "${formatCurrency(transaction.amount)} added to ${transaction.category}",
                    )
                    WidgetUpdater.updateAll(getApplication())
                }
                .onFailure(::handleFailure)
        }
    }

    fun beginAuthorization() {
        state = state.copy(authorizing = true, error = null)
    }

    fun onAuthorized(accessToken: String, email: String?) {
        state = state.copy(authorizing = false, authRequired = false, accountEmail = email)
        refresh(initial = state.snapshot.updatedAt == 0L, token = accessToken)
    }

    fun onAuthorizationFailed(message: String) {
        state = state.copy(authorizing = false, error = message)
    }

    fun dismissNotice() {
        state = state.copy(notice = null)
    }

    private fun handleFailure(error: Throwable) {
        repository.recordError(error)
        state = state.copy(
            loading = false,
            refreshing = false,
            authorizing = false,
            authRequired = error is AuthorizationRequiredException,
            error = BudgieRepository.friendly(error),
        )
        WidgetUpdater.updateAll(getApplication())
    }
}

internal fun formatCurrency(value: Double, decimals: Int = 2): String = java.text.NumberFormat
    .getCurrencyInstance(java.util.Locale.US)
    .apply { maximumFractionDigits = decimals; minimumFractionDigits = decimals }
    .format(value)
