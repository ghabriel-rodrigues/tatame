package br.com.tatame.feature.profile

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/** The Dados pessoais form fields (client-side identity of each input). */
enum class ProfileField {
    FULL_NAME, GENDER, PHONE, CPF, RG,
    ADDRESS_LINE, CITY_UF, CEP,
    EMERGENCY_NAME, EMERGENCY_PHONE,
}

/**
 * PT-BR copy for profile-slice failures (REP.13). Branches on the sealed
 * [ApiError] surface — stable codes, never human text. Per-field 422s map
 * onto the inputs via [profileFieldErrors]; this mapper covers the
 * screen-level bucket (network, read-only academy, etc.).
 */
@StringRes
internal fun ApiError.toProfileMessageRes(): Int = when (this) {
    is ApiError.Profile.FieldLocked -> R.string.error_profile_field_locked
    is ApiError.Profile.FieldReadOnly -> R.string.error_profile_field_read_only
    is ApiError.Validation -> R.string.error_form_invalid
    is ApiError.Tenant.ReadOnly -> R.string.error_read_only
    is ApiError.NotFound -> R.string.error_not_found
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    else -> R.string.error_generic
}

/** Server field name → form field (addressCity/addressState share the Cidade / UF input). */
internal fun profileFieldFor(serverField: String): ProfileField? = when (serverField) {
    "fullName" -> ProfileField.FULL_NAME
    "gender" -> ProfileField.GENDER
    "phone" -> ProfileField.PHONE
    "cpf" -> ProfileField.CPF
    "rg" -> ProfileField.RG
    "addressLine" -> ProfileField.ADDRESS_LINE
    "addressCity", "addressState" -> ProfileField.CITY_UF
    "addressZip" -> ProfileField.CEP
    "emergencyContactName" -> ProfileField.EMERGENCY_NAME
    "emergencyContactPhone" -> ProfileField.EMERGENCY_PHONE
    else -> null
}

/** Fixed PT-BR copy per field (server messages are never echoed — code rule). */
@StringRes
internal fun ProfileField.invalidMessageRes(): Int = when (this) {
    ProfileField.FULL_NAME -> R.string.profile_error_full_name
    ProfileField.GENDER -> R.string.profile_error_gender
    ProfileField.PHONE, ProfileField.EMERGENCY_PHONE -> R.string.profile_error_phone
    ProfileField.CPF -> R.string.profile_error_cpf
    ProfileField.RG -> R.string.profile_error_rg
    ProfileField.CITY_UF -> R.string.profile_error_uf
    ProfileField.CEP -> R.string.profile_error_cep
    ProfileField.ADDRESS_LINE, ProfileField.EMERGENCY_NAME -> R.string.error_form_invalid
}

/**
 * Per-field error map for a failed save: `validation.failed` rows map to the
 * fixed invalid copy; `profile.field_locked` rows to the locked copy (CPF/RG
 * write-once). Unknown server fields fall to the screen-level notice instead.
 */
internal fun ApiError.profileFieldErrors(): Map<ProfileField, Int> = when (this) {
    is ApiError.Validation ->
        fieldErrors.keys.mapNotNull(::profileFieldFor).associateWith { it.invalidMessageRes() }
    is ApiError.Profile.FieldLocked ->
        fields.mapNotNull(::profileFieldFor).associateWith { R.string.error_profile_field_locked }
    else -> emptyMap()
}
