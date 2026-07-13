package com.willcmcc.budgie

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.willcmcc.budgie.data.GoogleAuthorization
import com.willcmcc.budgie.ui.AppScreen
import com.willcmcc.budgie.ui.BudgieApp
import com.willcmcc.budgie.ui.BudgieViewModel
import com.willcmcc.budgie.ui.theme.BudgieTheme
import com.willcmcc.budgie.widget.WidgetUpdater

class MainActivity : ComponentActivity() {
    private val viewModel: BudgieViewModel by viewModels()

    private val authorizationLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult(),
    ) { activityResult ->
        val data = activityResult.data
        if (activityResult.resultCode != RESULT_OK || data == null) {
            viewModel.onAuthorizationFailed("Google connection was cancelled")
            return@registerForActivityResult
        }
        runCatching { Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data) }
            .onSuccess(::acceptAuthorization)
            .onFailure { viewModel.onAuthorizationFailed(it.message ?: "Google authorization failed") }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(0xFFEDE5D2.toInt(), 0xFFEDE5D2.toInt()),
            navigationBarStyle = SystemBarStyle.light(0xFFEDE5D2.toInt(), 0xFFEDE5D2.toInt()),
        )
        applyIntent(intent)
        setContent {
            BudgieTheme {
                BudgieApp(viewModel = viewModel, onAuthorize = ::authorize)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        WidgetUpdater.updateAll(this)
    }

    private fun authorize() {
        viewModel.beginAuthorization()
        Identity.getAuthorizationClient(this)
            .authorize(GoogleAuthorization.request())
            .addOnSuccessListener { result ->
                if (result.hasResolution()) {
                    val pendingIntent = result.pendingIntent
                    if (pendingIntent == null) {
                        viewModel.onAuthorizationFailed("Google authorization is unavailable")
                    } else {
                        authorizationLauncher.launch(IntentSenderRequest.Builder(pendingIntent.intentSender).build())
                    }
                } else {
                    acceptAuthorization(result)
                }
            }
            .addOnFailureListener { viewModel.onAuthorizationFailed(it.message ?: "Google authorization failed") }
    }

    private fun acceptAuthorization(result: AuthorizationResult) {
        val token = result.accessToken
        if (token.isNullOrBlank()) {
            viewModel.onAuthorizationFailed("Google did not return an access token")
            return
        }
        viewModel.onAuthorized(token, result.toGoogleSignInAccount()?.email)
    }

    private fun applyIntent(intent: Intent?) {
        when (intent?.getStringExtra(EXTRA_SCREEN)) {
            SCREEN_ADD -> viewModel.navigate(AppScreen.ADD)
            SCREEN_ACTIVITY -> viewModel.navigate(AppScreen.ACTIVITY)
            SCREEN_SETTINGS -> viewModel.navigate(AppScreen.SETTINGS)
            else -> Unit
        }
    }

    companion object {
        const val EXTRA_SCREEN = "budgie_screen"
        const val SCREEN_DASHBOARD = "dashboard"
        const val SCREEN_ADD = "add"
        const val SCREEN_ACTIVITY = "activity"
        const val SCREEN_SETTINGS = "settings"
    }
}
