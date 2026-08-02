package br.com.tatame

import android.app.Application
import br.com.tatame.core.di.appModules
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin

class TatameApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        startKoin {
            androidLogger()
            androidContext(this@TatameApplication)
            modules(appModules)
        }
    }
}
