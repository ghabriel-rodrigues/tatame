package br.com.tatame.core.di

import org.koin.core.annotation.KoinExperimentalAPI
import org.koin.test.verify.verify
import org.junit.Test

/**
 * Mandatory Koin graph-safety gate (ticket mobile-android/06): every module in
 * [appModules] must pass `verify()` — the JVM-time equivalent of Hilt's
 * compile-time graph validation. `extraTypes` lists (a) constructor parameter
 * types produced inside definition lambdas (OkHttpClient.Builder, Json
 * internals, Lazy) or fed from BuildConfig (String), and (b) types provided
 * by a *sibling* module — verify() checks one module at a time, so
 * cross-module edges (network ↔ session ↔ feature) must be declared here.
 */
class KoinModulesTest {

    @OptIn(KoinExperimentalAPI::class)
    @Test
    fun `koin dependency graph verifies`() {
        val extraTypes = listOf(
            // (a) lambda-internal / primitive inputs
            kotlin.String::class,
            kotlin.Boolean::class, // DependentsViewModel dependents.register runtime parameter
            kotlin.Lazy::class,
            okhttp3.OkHttpClient.Builder::class,
            kotlinx.serialization.json.JsonConfiguration::class,
            kotlinx.serialization.modules.SerializersModule::class,
            // (b) cross-module provisions
            br.com.tatame.core.network.TokenStore::class,
            br.com.tatame.core.network.AuthApi::class,
            br.com.tatame.core.network.EnrollmentApi::class,
            br.com.tatame.core.network.AttendanceApi::class,
            br.com.tatame.core.network.GraduationApi::class,
            br.com.tatame.core.network.BillingApi::class,
            br.com.tatame.core.network.AgendaApi::class,
            br.com.tatame.core.network.EventsApi::class,
            br.com.tatame.core.network.StoreApi::class,
            br.com.tatame.core.network.NotificationsApi::class,
            br.com.tatame.core.enrollment.EnrollmentRepository::class,
            br.com.tatame.core.attendance.AttendanceRepository::class,
            br.com.tatame.core.graduation.GraduationRepository::class,
            br.com.tatame.core.billing.BillingRepository::class,
            br.com.tatame.core.agenda.AgendaRepository::class,
            br.com.tatame.core.events.EventsRepository::class,
            br.com.tatame.core.attendance.LiveStreamClient::class,
            br.com.tatame.core.network.ApiConfig::class,
            br.com.tatame.core.network.SessionTokenProvider::class,
            br.com.tatame.core.network.AuthEvents::class,
            okhttp3.OkHttpClient::class,
            kotlinx.serialization.json.Json::class,
            br.com.tatame.core.auth.SessionManager::class,
            // themeModule (CFG.14/15): session Flow fed inside the definition
            // lambda; DataStore + app scope provided by sessionModule.
            kotlinx.coroutines.flow.Flow::class,
            androidx.datastore.core.DataStore::class,
            kotlinx.coroutines.CoroutineScope::class,
        )
        appModules.forEach { it.verify(extraTypes = extraTypes) }
    }
}
