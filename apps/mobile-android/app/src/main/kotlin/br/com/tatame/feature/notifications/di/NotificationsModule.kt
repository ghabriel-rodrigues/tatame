package br.com.tatame.feature.notifications.di

import br.com.tatame.core.notifications.NotificationsRepository
import br.com.tatame.core.notifications.NotificationsRepositoryImpl
import br.com.tatame.feature.notifications.NotificationSettingsViewModel
import br.com.tatame.feature.notifications.NotificationsBellViewModel
import br.com.tatame.feature.notifications.NotificationsViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Notifications feature module (NOT.10/11; ticket 06 conventions: `single`
 * for stateless infra, `viewModel` per screen). All three shells resolve the
 * same definitions — persona is a composable-layer concern (route mapping),
 * never a graph concern.
 */
val notificationsFeatureModule = module {
    single<NotificationsRepository> { NotificationsRepositoryImpl(get(), get()) }
    viewModel { NotificationsViewModel(get()) }
    viewModel { NotificationsBellViewModel(get()) }
    viewModel { NotificationSettingsViewModel(get()) }
}
