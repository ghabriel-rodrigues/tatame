// Semantic-route → shell-destination map (spec 010): DB rows carry only the
// semantic hint (wallet, event/{id}, graduation, orders, store); each shell
// resolves it to its own navigation. Guardian wallet lands on the
// Pagamentos tab, guardian graduation on the dependents panel, guardian
// events on the Eventos tab; the professor has no financial or graduation
// surface, so those rows stay inert (RBAC: professor never sees money).

import Foundation
import TatameCore

/// The three mobile shells (spec 010 mobile scope; admin/plataforma are
/// web-console personas).
public enum NotificationsPersona: Sendable, Equatable {
    case aluno
    case professor
    case responsavel
}

/// Shell-level landing spot for a tapped row. The shell interprets tabs and
/// pushes; the feed never knows router paths.
public enum NotificationDestination: Equatable, Sendable {
    /// Aluno Carteira tab.
    case carteiraTab
    /// Responsável Pagamentos tab.
    case pagamentosTab
    /// Responsável Eventos tab (per-dependent confirmation list).
    case eventosTab
    /// Responsável dependents panel (Alunos tab — per-child evolution).
    case alunosTab
    /// Aluno event detail push.
    case eventDetail(id: UUID)
    /// Aluno Graduação screen push.
    case graduation
    /// Meus pedidos push (aluno + professor storefront surface).
    case myOrders
    /// Store vitrine push (admin low-stock rows never reach mobile; this
    /// serves the buyer-facing `store` hint if it ever addresses one).
    case storeVitrine
}

public enum NotificationRoutePlan {
    /// Resolves a parsed semantic route for one shell; nil = the row is
    /// inert on tap (spec 010 — unknown/null routes are inert).
    public static func destination(
        for route: NotificationRoute,
        persona: NotificationsPersona
    ) -> NotificationDestination? {
        switch persona {
        case .aluno:
            switch route {
            case .wallet: return .carteiraTab
            case .event(let id): return .eventDetail(id: id)
            case .graduation: return .graduation
            case .orders: return .myOrders
            case .store: return .storeVitrine
            }
        case .professor:
            switch route {
            case .wallet: return nil
            case .event: return nil
            case .graduation: return nil
            case .orders: return .myOrders
            case .store: return .storeVitrine
            }
        case .responsavel:
            switch route {
            case .wallet: return .pagamentosTab
            case .event: return .eventosTab
            case .graduation: return .alunosTab
            case .orders: return nil
            case .store: return nil
            }
        }
    }
}
