package br.com.tatame.core.di

import org.koin.core.annotation.KoinExperimentalAPI
import org.koin.test.verify.verify
import org.junit.Test

/**
 * Mandatory Koin graph-safety gate (ticket mobile-android/06): every module in
 * [appModules] must pass `verify()` — the JVM-time equivalent of Hilt's
 * compile-time graph validation. Extend `extraTypes` as Android framework
 * types enter constructor signatures.
 */
class KoinModulesTest {

    @OptIn(KoinExperimentalAPI::class)
    @Test
    fun `koin dependency graph verifies`() {
        appModules.forEach { it.verify() }
    }
}
