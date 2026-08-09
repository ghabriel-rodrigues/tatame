package br.com.tatame.core.di

import br.com.tatame.BuildConfig
import br.com.tatame.core.network.ApiConfig
import br.com.tatame.core.network.AttendanceApi
import br.com.tatame.core.network.AuthApi
import br.com.tatame.core.network.AuthEvents
import br.com.tatame.core.network.AuthInterceptor
import br.com.tatame.core.network.BillingApi
import br.com.tatame.core.network.EnrollmentApi
import br.com.tatame.core.network.GraduationApi
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.RefreshAuthenticator
import br.com.tatame.core.network.SessionTokenProvider
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import org.koin.core.qualifier.named
import org.koin.dsl.module
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Qualifier for the bare (no-auth) HTTP stack the refresh call runs on. */
val BARE = named("bare")

/**
 * Networking per ticket mobile-android/02: shared Json, bare + authed OkHttp,
 * Retrofit with the first-party kotlinx.serialization converter, and the
 * single-flight refresh Authenticator.
 */
val networkModule = module {
    single { ApiConfig(BuildConfig.API_BASE_URL) }
    single<Json> { ProblemJson }
    single { SessionTokenProvider() }
    single { AuthEvents() }

    // Bare stack — used exclusively by the RefreshAuthenticator (no recursion).
    single<OkHttpClient>(BARE) { OkHttpClient.Builder().build() }
    single<AuthApi>(BARE) {
        buildRetrofit(get<ApiConfig>().baseUrl, get(BARE), get()).create(AuthApi::class.java)
    }

    single {
        RefreshAuthenticator(
            tokenProvider = get(),
            tokenStore = get(),
            refreshApi = lazy { get<AuthApi>(BARE) },
            authEvents = get(),
        )
    }

    // Authed stack — bearer interceptor + single-flight 401 refresh.
    single<OkHttpClient> {
        OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(get()))
            .authenticator(get<RefreshAuthenticator>())
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(
                        HttpLoggingInterceptor().apply {
                            level = HttpLoggingInterceptor.Level.BASIC
                            redactHeader("Authorization")
                        },
                    )
                }
            }
            .build()
    }
    single<AuthApi> {
        buildRetrofit(get<ApiConfig>().baseUrl, get(), get()).create(AuthApi::class.java)
    }
    single<EnrollmentApi> {
        buildRetrofit(get<ApiConfig>().baseUrl, get(), get()).create(EnrollmentApi::class.java)
    }
    single<AttendanceApi> {
        buildRetrofit(get<ApiConfig>().baseUrl, get(), get()).create(AttendanceApi::class.java)
    }
    single<GraduationApi> {
        buildRetrofit(get<ApiConfig>().baseUrl, get(), get()).create(GraduationApi::class.java)
    }
    single<BillingApi> {
        buildRetrofit(get<ApiConfig>().baseUrl, get(), get()).create(BillingApi::class.java)
    }
}

internal fun buildRetrofit(baseUrl: String, client: OkHttpClient, json: Json): Retrofit =
    Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
