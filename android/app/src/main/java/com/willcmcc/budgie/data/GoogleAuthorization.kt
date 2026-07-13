package com.willcmcc.budgie.data

import android.content.Context
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

class AuthorizationRequiredException : IllegalStateException("Google permission is required")

object GoogleAuthorization {
    private val scopes = listOf(Scope("https://www.googleapis.com/auth/drive.file"))

    fun request(): AuthorizationRequest = AuthorizationRequest.builder()
        .setRequestedScopes(scopes)
        .build()

    suspend fun result(context: Context): AuthorizationResult = suspendCoroutine { continuation ->
        Identity.getAuthorizationClient(context)
            .authorize(request())
            .addOnSuccessListener { continuation.resume(it) }
            .addOnFailureListener { continuation.resumeWithException(it) }
    }

    suspend fun token(context: Context): String {
        val result = result(context)
        if (result.hasResolution()) throw AuthorizationRequiredException()
        return result.accessToken?.takeIf { it.isNotBlank() }
            ?: throw AuthorizationRequiredException()
    }
}

