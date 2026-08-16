package br.com.tatame.feature.profile

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.R
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoProfileResponse
import br.com.tatame.core.profile.ProfileRepository
import br.com.tatame.core.profile.ProfileUpdate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Dados pessoais load state (REP.13, aluno-18). */
sealed interface ProfileLoadState {
    data object Loading : ProfileLoadState
    data class Error(@param:StringRes val messageRes: Int) : ProfileLoadState
    data class Loaded(val profile: AlunoProfileResponse) : ProfileLoadState
}

/** Editable form mirror of the aluno-18 inputs (locked/read-only fields excluded). */
data class ProfileFormState(
    val fullName: String = "",
    val gender: String? = null, // female | male | other | unspecified | null
    val phone: String = "",
    val cpfInput: String = "", // digits; only editable while unlocked
    val rgInput: String = "", // free format; only editable while unlocked
    val addressLine: String = "",
    val cityUf: String = "", // single "Cidade / UF" input (parsed on save)
    val cep: String = "", // digits
    val emergencyName: String = "",
    val emergencyPhone: String = "",
)

data class DadosPessoaisUiState(
    val load: ProfileLoadState = ProfileLoadState.Loading,
    val form: ProfileFormState = ProfileFormState(),
    val fieldErrors: Map<ProfileField, Int> = emptyMap(),
    val saving: Boolean = false,
    @param:StringRes val noticeRes: Int? = null,
    val noticeIsError: Boolean = false,
)

/**
 * Aluno Dados pessoais (REP.13): GET /v1/aluno/profile feeds the form; Salvar
 * sends the full editable set as one PUT (explicit nulls clear; CPF/RG only
 * while unlocked and non-blank — write-once fields are never cleared or
 * re-sent once locked). Per-field 422s land on their inputs; the refreshed
 * response re-primes the form so a just-set CPF flips to its locked box.
 */
class DadosPessoaisViewModel(private val repository: ProfileRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(DadosPessoaisUiState())
    val uiState: StateFlow<DadosPessoaisUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(load = ProfileLoadState.Loading) }
        viewModelScope.launch {
            when (val result = repository.profile()) {
                is ApiResult.Success -> applyProfile(result.value)
                is ApiResult.Failure -> _uiState.update {
                    it.copy(load = ProfileLoadState.Error(result.error.toProfileMessageRes()))
                }
            }
        }
    }

    // ---- form edits (any edit clears that field's error + the notice) -----

    fun updateFullName(value: String) = edit(ProfileField.FULL_NAME) { it.copy(fullName = value) }
    fun updateGender(value: String?) = edit(ProfileField.GENDER) { it.copy(gender = value) }
    fun updatePhone(value: String) = edit(ProfileField.PHONE) { it.copy(phone = value) }
    fun updateCpf(value: String) = edit(ProfileField.CPF) {
        it.copy(cpfInput = ProfileFormat.digitsOnly(value).take(11))
    }
    fun updateRg(value: String) = edit(ProfileField.RG) { it.copy(rgInput = value) }
    fun updateAddressLine(value: String) =
        edit(ProfileField.ADDRESS_LINE) { it.copy(addressLine = value) }
    fun updateCityUf(value: String) = edit(ProfileField.CITY_UF) { it.copy(cityUf = value) }
    fun updateCep(value: String) = edit(ProfileField.CEP) {
        it.copy(cep = ProfileFormat.digitsOnly(value).take(8))
    }
    fun updateEmergencyName(value: String) =
        edit(ProfileField.EMERGENCY_NAME) { it.copy(emergencyName = value) }
    fun updateEmergencyPhone(value: String) =
        edit(ProfileField.EMERGENCY_PHONE) { it.copy(emergencyPhone = value) }

    // ---- Salvar ----------------------------------------------------------

    fun save() {
        val state = _uiState.value
        val profile = (state.load as? ProfileLoadState.Loaded)?.profile ?: return
        if (state.saving) return
        if (state.form.fullName.isBlank()) {
            _uiState.update {
                it.copy(
                    fieldErrors = mapOf(ProfileField.FULL_NAME to R.string.profile_error_full_name),
                    noticeRes = null,
                )
            }
            return
        }

        _uiState.update { it.copy(saving = true, fieldErrors = emptyMap(), noticeRes = null) }
        viewModelScope.launch {
            when (val result = repository.update(buildUpdate(profile, _uiState.value.form))) {
                is ApiResult.Success -> {
                    applyProfile(result.value)
                    _uiState.update {
                        it.copy(saving = false, noticeRes = R.string.profile_saved, noticeIsError = false)
                    }
                }
                is ApiResult.Failure -> {
                    val fieldErrors = result.error.profileFieldErrors()
                    _uiState.update {
                        it.copy(
                            saving = false,
                            fieldErrors = fieldErrors,
                            // The screen-level notice only when nothing landed on a field.
                            noticeRes = if (fieldErrors.isEmpty()) {
                                result.error.toProfileMessageRes()
                            } else {
                                null
                            },
                            noticeIsError = true,
                        )
                    }
                }
            }
        }
    }

    fun dismissNotice() = _uiState.update { it.copy(noticeRes = null) }

    // ---- internals -------------------------------------------------------

    private inline fun edit(field: ProfileField, crossinline transform: (ProfileFormState) -> ProfileFormState) =
        _uiState.update {
            it.copy(form = transform(it.form), fieldErrors = it.fieldErrors - field, noticeRes = null)
        }

    private fun applyProfile(profile: AlunoProfileResponse) = _uiState.update {
        it.copy(
            load = ProfileLoadState.Loaded(profile),
            form = ProfileFormState(
                fullName = profile.fullName,
                gender = profile.gender,
                phone = profile.phone.orEmpty(),
                cpfInput = if (profile.cpfLocked) "" else profile.cpf.orEmpty(),
                rgInput = if (profile.rgLocked) "" else profile.rg.orEmpty(),
                addressLine = profile.addressLine.orEmpty(),
                cityUf = ProfileFormat.cityUfLine(profile.addressCity, profile.addressState),
                cep = profile.addressZip.orEmpty(),
                emergencyName = profile.emergencyContactName.orEmpty(),
                emergencyPhone = profile.emergencyContactPhone.orEmpty(),
            ),
        )
    }

    private fun buildUpdate(profile: AlunoProfileResponse, form: ProfileFormState): ProfileUpdate {
        val (city, uf) = ProfileFormat.parseCityUf(form.cityUf)
        return ProfileUpdate(
            fullName = form.fullName.trim(),
            gender = form.gender,
            phone = form.phone.trim().ifEmpty { null },
            cpf = form.cpfInput.takeIf { !profile.cpfLocked && it.isNotBlank() },
            rg = form.rgInput.trim().takeIf { !profile.rgLocked && it.isNotBlank() },
            addressLine = form.addressLine.trim().ifEmpty { null },
            addressCity = city,
            addressState = uf,
            addressZip = form.cep.trim().ifEmpty { null },
            emergencyContactName = form.emergencyName.trim().ifEmpty { null },
            emergencyContactPhone = form.emergencyPhone.trim().ifEmpty { null },
        )
    }
}
