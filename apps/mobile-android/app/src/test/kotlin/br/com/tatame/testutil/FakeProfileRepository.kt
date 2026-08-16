package br.com.tatame.testutil

import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoProfileResponse
import br.com.tatame.core.profile.ProfileRepository
import br.com.tatame.core.profile.ProfileUpdate

/** Configurable in-memory [ProfileRepository] for ViewModel tests. */
class FakeProfileRepository : ProfileRepository {

    var profileResult: ApiResult<AlunoProfileResponse> = ApiResult.Failure(ApiError.Network)
    var updateResult: ApiResult<AlunoProfileResponse> = ApiResult.Failure(ApiError.Network)

    var profileCalls = 0
    val updateCalls = mutableListOf<ProfileUpdate>()

    override suspend fun profile(): ApiResult<AlunoProfileResponse> {
        profileCalls++
        return profileResult
    }

    override suspend fun update(update: ProfileUpdate): ApiResult<AlunoProfileResponse> {
        updateCalls += update
        return updateResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun alunoProfile(
    fullName: String = "Lucas Almeida",
    email: String = "lucas.almeida@email.com",
    birthDate: String? = "1998-03-14",
    phone: String? = "(11) 98765-4321",
    gender: String? = "male",
    cpf: String? = "12345678909",
    cpfLocked: Boolean = cpf != null,
    rg: String? = "12.345.678-9",
    rgLocked: Boolean = rg != null,
    addressLine: String? = "Rua das Palmeiras, 120, ap 42",
    addressCity: String? = "São Paulo",
    addressState: String? = "SP",
    addressZip: String? = "01310100",
    emergencyContactName: String? = "Carla Almeida",
    emergencyContactPhone: String? = "(11) 91234-5678",
) = AlunoProfileResponse(
    fullName = fullName,
    email = email,
    birthDate = birthDate,
    phone = phone,
    gender = gender,
    cpf = cpf,
    cpfLocked = cpfLocked,
    rg = rg,
    rgLocked = rgLocked,
    addressLine = addressLine,
    addressCity = addressCity,
    addressState = addressState,
    addressZip = addressZip,
    emergencyContactName = emergencyContactName,
    emergencyContactPhone = emergencyContactPhone,
    avatarUrl = null,
)
