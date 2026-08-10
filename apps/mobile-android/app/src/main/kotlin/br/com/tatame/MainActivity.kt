package br.com.tatame

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import br.com.tatame.core.designsystem.theme.TatameTheme
import br.com.tatame.core.navigation.AppRoot
import br.com.tatame.core.theme.ThemeController
import org.koin.compose.koinInject

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val themeController = koinInject<ThemeController>()
            val themeState by themeController.state.collectAsState()

            // CFG.15 — system bar icons follow the explicit theme preference
            // (light icons on the dark shell, dark icons on the light shell).
            LaunchedEffect(themeState.darkTheme) {
                enableEdgeToEdge(
                    statusBarStyle = if (themeState.darkTheme) {
                        SystemBarStyle.dark(Color.TRANSPARENT)
                    } else {
                        SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                    },
                    navigationBarStyle = if (themeState.darkTheme) {
                        SystemBarStyle.dark(Color.TRANSPARENT)
                    } else {
                        SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                    },
                )
            }

            // CFG.14 — session academy brand (cached for cold start) +
            // CFG.15 — persisted dark preference drive the whole shell.
            TatameTheme(brand = themeState.brand, darkTheme = themeState.darkTheme) {
                AppRoot()
            }
        }
    }
}
