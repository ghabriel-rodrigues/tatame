// PT-BR copy for the Dados pessoais slice (UI copy only; code stays
// English). Per-field validation messages come from the backend already in
// PT-BR; the copy here covers the client-known states.

import TatameCore

public enum ProfileMessages {
    public static let loadFailed = "Não foi possível carregar seus dados. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
    public static let generic = "Algo deu errado. Tente novamente."
    public static let saved = "Dados salvos."
    public static let readOnly = "Academia em modo somente leitura — alterações bloqueadas."
    /// CPF/RG write-once (422 profile.field_locked) — shown on the field.
    public static let fieldLocked = "Não pode ser alterado após definido."
    /// 422 profile.field_read_only — unreachable by construction (the client
    /// never sends email/birthDate); kept for defensive completeness.
    public static let fieldReadOnly = "E-mail e data de nascimento não podem ser alterados pelo perfil."
    /// "Trocar foto" placeholder (avatars stay initials in v1 — recorded).
    public static let photoPlaceholder = "Trocar foto"

    /// Banner copy for save failures without a field to land on.
    public static func message(for error: ApiError) -> String {
        switch error.code {
        case ApiErrorCode.tenantReadOnly:
            return readOnly
        case ApiErrorCode.profileFieldReadOnly:
            return fieldReadOnly
        default:
            break
        }
        if case .network = error { return offline }
        return generic
    }
}
