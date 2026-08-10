package br.com.tatame.feature.notifications

/** Which shell is rendering the shared Notificações screen (spec 010). */
enum class NotificationsPersona { ALUNO, PROFESSOR, RESPONSAVEL }

/**
 * Where a tapped notification lands inside the current shell — the client
 * half of the semantic `route` contract (DB rows never encode router paths).
 */
sealed interface NotificationDestination {
    /** Aluno Carteira tab. */
    data object Carteira : NotificationDestination

    /** Responsável Pagamentos tab (guardian `wallet` per spec 010). */
    data object Pagamentos : NotificationDestination

    /** Aluno event detail push (spec 008 surface). */
    data class EventDetail(val eventId: String) : NotificationDestination

    /** Responsável Eventos tab (per-dependent confirmation, responsavel-06). */
    data object Eventos : NotificationDestination

    /** Aluno Graduação screen. */
    data object Graduacao : NotificationDestination

    /** Responsável dependents panel (per-child evolution lives there). */
    data object Dependentes : NotificationDestination

    /** Meus pedidos (aluno + professor storefront consumers). */
    data object MeusPedidos : NotificationDestination

    /** Storefront vitrine. */
    data object Loja : NotificationDestination
}

/**
 * Semantic-route → shell-destination map (spec 010 NOT.10/11): `wallet`,
 * `event/{eventId}`, `graduation`, `orders`, `store` per persona. Unknown or
 * null routes are inert (`null`) — a newer server never breaks an older
 * client. Professor has no wallet/graduation/event surface (spec 006/008:
 * no professor financial access, no professor event route), so only the
 * storefront hints navigate there. Guardian routes land on the persona's
 * tabs: Pagamentos, Eventos and the dependents panel (per-child evolution).
 */
fun mapNotificationRoute(
    persona: NotificationsPersona,
    route: String?,
): NotificationDestination? {
    if (route.isNullOrBlank()) return null
    val eventId = route
        .takeIf { it.startsWith("$ROUTE_EVENT_PREFIX/") }
        ?.removePrefix("$ROUTE_EVENT_PREFIX/")
        ?.takeIf { it.isNotBlank() }
    return when (persona) {
        NotificationsPersona.ALUNO -> when {
            route == ROUTE_WALLET -> NotificationDestination.Carteira
            eventId != null -> NotificationDestination.EventDetail(eventId)
            route == ROUTE_GRADUATION -> NotificationDestination.Graduacao
            route == ROUTE_ORDERS -> NotificationDestination.MeusPedidos
            route == ROUTE_STORE -> NotificationDestination.Loja
            else -> null
        }
        NotificationsPersona.PROFESSOR -> when (route) {
            ROUTE_ORDERS -> NotificationDestination.MeusPedidos
            ROUTE_STORE -> NotificationDestination.Loja
            else -> null
        }
        NotificationsPersona.RESPONSAVEL -> when {
            route == ROUTE_WALLET -> NotificationDestination.Pagamentos
            eventId != null -> NotificationDestination.Eventos
            route == ROUTE_GRADUATION -> NotificationDestination.Dependentes
            else -> null
        }
    }
}

private const val ROUTE_WALLET = "wallet"
private const val ROUTE_EVENT_PREFIX = "event"
private const val ROUTE_GRADUATION = "graduation"
private const val ROUTE_ORDERS = "orders"
private const val ROUTE_STORE = "store"
