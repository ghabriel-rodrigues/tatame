package br.com.tatame.core.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import br.com.tatame.R
import br.com.tatame.core.auth.LogoutReason
import br.com.tatame.core.auth.SessionManager
import br.com.tatame.core.auth.SessionState
import br.com.tatame.core.network.dto.AcademyStatus
import br.com.tatame.core.network.dto.MeResponse
import br.com.tatame.core.network.dto.Roles
import br.com.tatame.feature.agenda.aluno.AlunoAgendaTab
import br.com.tatame.feature.attendance.aluno.AlunoHomeTab
import br.com.tatame.feature.attendance.professor.ProfessorHomeTab
import br.com.tatame.feature.auth.LoginScreen
import br.com.tatame.feature.auth.MembershipChooserScreen
import br.com.tatame.feature.auth.roleLabel
import br.com.tatame.feature.billing.aluno.CarteiraTab
import br.com.tatame.feature.billing.responsavel.PagamentosTab
import br.com.tatame.feature.enrollment.professor.TurmasTab
import br.com.tatame.feature.enrollment.responsavel.DEPENDENTS_REGISTER_PERMISSION
import br.com.tatame.feature.enrollment.responsavel.DependentsHomeTab
import br.com.tatame.feature.events.responsavel.ResponsavelEventosTab
import br.com.tatame.feature.graduation.aluno.AlunoPerfilTab
import br.com.tatame.feature.graduation.professor.GRADUATION_UPDATE_PERMISSION
import br.com.tatame.feature.graduation.professor.ProfessorPerfilTab
import br.com.tatame.feature.shell.PersonaShellScreen
import br.com.tatame.feature.shell.ResponsavelPerfilTab
import br.com.tatame.feature.shell.SuspendedAcademyScreen
import br.com.tatame.feature.shell.WebOnlyRoleScreen
import br.com.tatame.feature.splash.SplashScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

private const val SPLASH_HOLD_MS = 1_900L

/**
 * State-driven root router (no nav library yet — the auth slice has a linear
 * flow): splash (cold-start silent refresh behind a ~1.9s brand hold) →
 * login / membership chooser / role-gated shell.
 */
@Composable
fun AppRoot() {
    val sessionManager = koinInject<SessionManager>()
    val sessionState by sessionManager.state.collectAsState()
    val scope = rememberCoroutineScope()
    var splashHoldElapsed by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { sessionManager.bootstrap() }
    LaunchedEffect(Unit) {
        delay(SPLASH_HOLD_MS)
        splashHoldElapsed = true
    }

    val onLogout: () -> Unit = { scope.launch { sessionManager.logout() } }

    val state = sessionState
    when {
        // Brand hold: the splash stays up ~1.9s even when bootstrap finishes first.
        !splashHoldElapsed || state is SessionState.Booting -> SplashScreen()
        state is SessionState.LoggedOut -> LoginScreen(
            sessionMessageRes = when (state.reason) {
                LogoutReason.SESSION_EXPIRED -> R.string.session_expired_message
                LogoutReason.OFFLINE -> R.string.session_offline_message
                LogoutReason.NONE, LogoutReason.USER_LOGOUT -> null
            },
        )
        state is SessionState.ChoosingMembership -> MembershipChooserScreen(
            state = state,
            onChoose = { membershipId -> scope.launch { sessionManager.chooseMembership(membershipId) } },
        )
        state is SessionState.Authenticated -> RoleGate(me = state.me, onLogout = onLogout)
    }
}

/** AUTH.23 — shell selection on session role + academy-status gates. */
@Composable
private fun RoleGate(me: MeResponse, onLogout: () -> Unit) {
    val isAcademyPersona = me.activeRole in MOBILE_ROLES
    when {
        isAcademyPersona && me.academy?.status == AcademyStatus.SUSPENDED ->
            SuspendedAcademyScreen(academyName = me.academy.name, onLogout = onLogout)

        me.activeRole == Roles.STUDENT -> PersonaShellScreen(
            me = me,
            tabLabels = listOf(
                R.string.tab_home,
                R.string.tab_agenda,
                R.string.tab_checkin,
                R.string.tab_wallet,
                R.string.tab_profile,
            ),
            onLogout = onLogout,
            // ATT.19 — Início (index 0) is the real aluno surface; the central
            // Check-in tab (index 2) routes there with the sheet already open.
            // AGD.7 — Agenda (index 1) is the real weekday agenda; the hero
            // "Ver agenda" CTA now navigates there (closed debt). BIL.19 —
            // Carteira (index 3) is the real wallet; the home mensalidade
            // alert deep-links into it. GRD.19 — Perfil (index 4) carries the
            // real derived belt chip.
            tabContent = mapOf(
                0 to { selectTab ->
                    AlunoHomeTab(
                        firstName = me.user.fullName.substringBefore(' '),
                        academyName = me.academy?.name,
                        onOpenCarteira = { selectTab(3) },
                        onOpenAgenda = { selectTab(1) },
                    )
                },
                1 to { _ ->
                    AlunoAgendaTab(academyName = me.academy?.name)
                },
                2 to { selectTab ->
                    AlunoHomeTab(
                        firstName = me.user.fullName.substringBefore(' '),
                        academyName = me.academy?.name,
                        openCheckinOnEnter = true,
                        onOpenCarteira = { selectTab(3) },
                        onOpenAgenda = { selectTab(1) },
                    )
                },
                3 to { _ ->
                    CarteiraTab(academyName = me.academy?.name)
                },
                4 to { _ ->
                    AlunoPerfilTab(
                        fullName = me.user.fullName,
                        academyName = me.academy?.name,
                        onLogout = onLogout,
                    )
                },
            ),
        )

        me.activeRole == Roles.PROFESSOR -> PersonaShellScreen(
            me = me,
            tabLabels = listOf(
                R.string.tab_home,
                R.string.tab_classes,
                R.string.tab_students,
                R.string.tab_profile,
            ),
            onLogout = onLogout,
            // ENR.21/22 — Turmas tab (index 1); ATT.20/21 — dashboard (index 0);
            // GRD.20 — perfil do aluno via roster tap (graduation.update gate)
            // + own Perfil tab (index 3, belt chip + Graduações válidas).
            tabContent = mapOf(
                0 to { selectTab ->
                    ProfessorHomeTab(
                        firstName = me.user.fullName.substringBefore(' '),
                        onVerTurmas = { selectTab(1) },
                        // NOT.11 — `store`-routed rows open the storefront,
                        // whose header wants the academy name.
                        academyName = me.academy?.name,
                    )
                },
                1 to { _ ->
                    TurmasTab(
                        academyName = me.academy?.name,
                        canUpdateGraduations =
                            me.permissions[GRADUATION_UPDATE_PERMISSION] ?: true,
                    )
                },
                3 to { _ ->
                    ProfessorPerfilTab(
                        fullName = me.user.fullName,
                        academyName = me.academy?.name,
                        onLogout = onLogout,
                    )
                },
            ),
        )

        me.activeRole == Roles.GUARDIAN -> PersonaShellScreen(
            me = me,
            // EVT.13 — the redundant "Dependentes" placeholder tab (the home
            // already IS the dependents panel) gives way to the real Eventos
            // tab, restoring the prototype's Início/Pagamentos/Eventos/Perfil
            // bar (responsavel-06).
            tabLabels = listOf(
                R.string.tab_home,
                R.string.tab_payments,
                R.string.tab_events,
                R.string.tab_profile,
            ),
            onLogout = onLogout,
            // ENR.22/23 — home tab (index 0) is the dependents panel; the
            // Cadastrar aluno CTA is hidden when dependents.register is off.
            // BIL.21 — Pagamentos (index 1) is the real per-dependent wallet.
            // EVT.13 — Eventos (index 2) is the per-dependent confirmation tab.
            // NOT.11 — home carries the bell; guardian notification routes
            // land on the persona tabs (wallet → Pagamentos, event → Eventos);
            // Perfil (index 3) hosts the Notificações mute switch.
            tabContent = mapOf(
                0 to { selectTab ->
                    DependentsHomeTab(
                        guardianFirstName = me.user.fullName.substringBefore(' '),
                        canRegisterDependents =
                            me.permissions[DEPENDENTS_REGISTER_PERMISSION] ?: true,
                        onOpenPagamentos = { selectTab(1) },
                        onOpenEventos = { selectTab(2) },
                    )
                },
                1 to { _ ->
                    PagamentosTab()
                },
                2 to { _ ->
                    ResponsavelEventosTab()
                },
                3 to { _ ->
                    ResponsavelPerfilTab(
                        fullName = me.user.fullName,
                        academyName = me.academy?.name,
                        onLogout = onLogout,
                    )
                },
            ),
        )

        // admin + platform roles (owner/support/finance) are web-console surfaces.
        else -> WebOnlyRoleScreen(roleLabel = roleLabel(me.activeRole), onLogout = onLogout)
    }
}

private val MOBILE_ROLES = setOf(Roles.STUDENT, Roles.PROFESSOR, Roles.GUARDIAN)
