package br.com.tatame.core.network

import okhttp3.Interceptor
import okhttp3.Response

/** Attaches `Authorization: Bearer` from the in-memory [SessionTokenProvider]. */
class AuthInterceptor(private val tokenProvider: SessionTokenProvider) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider.accessToken ?: return chain.proceed(chain.request())
        val request = chain.request().newBuilder()
            .header("Authorization", "Bearer $token")
            .build()
        return chain.proceed(request)
    }
}
