// PT-BR copy for the notifications slice (UI copy only; code stays
// English). Row content arrives rendered from the API — this file carries
// only the surface labels and error/empty copy.

import TatameCore

public enum NotificationsMessages {
    public static let title = "Notificações"
    public static let loadFailed = "Não foi possível carregar. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
    public static let generic = "Algo deu errado. Tente novamente."

    /// Honest empty state — the feed never fabricates rows.
    public static let empty = "Nenhuma notificação por aqui."
    public static let emptyCaption = "Avisos de pagamentos, eventos e graduações aparecem aqui."

    /// The perfil switch row label (aluno-19 / professor-12 / responsavel-07).
    public static let settingsRow = "Notificações"
    public static let settingsFailed = "Não foi possível salvar. Tente novamente."

    /// Maps the typed ApiError to PT-BR copy on stable codes only.
    public static func message(for error: ApiError) -> String {
        switch error {
        case .network:
            offline
        default:
            generic
        }
    }
}
