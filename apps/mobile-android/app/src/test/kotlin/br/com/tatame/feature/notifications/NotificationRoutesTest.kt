package br.com.tatame.feature.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * NOT.10/11 — the semantic-route → shell-destination map per persona (spec
 * 010): `wallet`, `event/{eventId}`, `graduation`, `orders`, `store` land on
 * each shell's surfaces; unknown/null routes are inert so a newer server
 * never breaks an older client.
 */
class NotificationRoutesTest {

    private fun aluno(route: String?) =
        mapNotificationRoute(NotificationsPersona.ALUNO, route)

    private fun professor(route: String?) =
        mapNotificationRoute(NotificationsPersona.PROFESSOR, route)

    private fun responsavel(route: String?) =
        mapNotificationRoute(NotificationsPersona.RESPONSAVEL, route)

    // ---- aluno -----------------------------------------------------------

    @Test
    fun `aluno maps every semantic route to its shell surface`() {
        assertEquals(NotificationDestination.Carteira, aluno("wallet"))
        assertEquals(NotificationDestination.EventDetail("ev1"), aluno("event/ev1"))
        assertEquals(NotificationDestination.Graduacao, aluno("graduation"))
        assertEquals(NotificationDestination.MeusPedidos, aluno("orders"))
        assertEquals(NotificationDestination.Loja, aluno("store"))
    }

    // ---- professor -------------------------------------------------------

    @Test
    fun `professor maps only the storefront hints`() {
        assertEquals(NotificationDestination.MeusPedidos, professor("orders"))
        assertEquals(NotificationDestination.Loja, professor("store"))
    }

    @Test
    fun `professor has no wallet, event or graduation surface`() {
        assertNull(professor("wallet"))
        assertNull(professor("event/ev1"))
        assertNull(professor("graduation"))
    }

    // ---- responsavel -----------------------------------------------------

    @Test
    fun `responsavel maps guardian routes to the persona tabs`() {
        assertEquals(NotificationDestination.Pagamentos, responsavel("wallet"))
        assertEquals(NotificationDestination.Eventos, responsavel("event/ev1"))
        assertEquals(NotificationDestination.Dependentes, responsavel("graduation"))
    }

    @Test
    fun `responsavel never receives storefront hints`() {
        assertNull(responsavel("orders"))
        assertNull(responsavel("store"))
    }

    // ---- forward compatibility -------------------------------------------

    @Test
    fun `null and blank routes are inert for every persona`() {
        NotificationsPersona.entries.forEach { persona ->
            assertNull(mapNotificationRoute(persona, null))
            assertNull(mapNotificationRoute(persona, ""))
            assertNull(mapNotificationRoute(persona, "   "))
        }
    }

    @Test
    fun `unknown routes are inert for every persona`() {
        NotificationsPersona.entries.forEach { persona ->
            assertNull(mapNotificationRoute(persona, "mystery/new-surface"))
        }
    }

    @Test
    fun `an event route with an empty id is inert`() {
        assertNull(aluno("event/"))
        assertNull(responsavel("event/"))
        // "event" without a slash is not the event prefix contract either.
        assertNull(aluno("event"))
    }
}
