package br.com.tatame.feature.profile

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.testutil.FakeProfileRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.alunoProfile
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** REP.13 — Dados pessoais form state over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class DadosPessoaisViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `load primes the form and keeps locked documents out of the inputs`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Success(alunoProfile())
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        val loaded = state.load as ProfileLoadState.Loaded
        assertTrue(loaded.profile.cpfLocked)
        assertEquals("Lucas Almeida", state.form.fullName)
        assertEquals("São Paulo / SP", state.form.cityUf)
        assertEquals("01310100", state.form.cep)
        // Locked documents render as dashed boxes — the editable inputs stay empty.
        assertEquals("", state.form.cpfInput)
        assertEquals("", state.form.rgInput)
        assertEquals(1, repository.profileCalls)
    }

    @Test
    fun `load primes editable cpf and rg while unlocked`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Success(
            alunoProfile(cpf = null, cpfLocked = false, rg = null, rgLocked = false),
        )
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()

        val form = viewModel.uiState.value.form
        assertEquals("", form.cpfInput)
        viewModel.updateCpf("123.456.789-09") // masked paste → digits only
        assertEquals("12345678909", viewModel.uiState.value.form.cpfInput)
    }

    @Test
    fun `save sends the full editable set with parsed city and UF and locked documents omitted`() =
        runTest {
            val repository = FakeProfileRepository()
            repository.profileResult = ApiResult.Success(alunoProfile())
            repository.updateResult = ApiResult.Success(alunoProfile(fullName = "Lucas A. Silva"))
            val viewModel = DadosPessoaisViewModel(repository)
            advanceUntilIdle()

            viewModel.updateFullName("Lucas A. Silva")
            viewModel.updateCityUf("Campinas / sp")
            viewModel.updatePhone("") // cleared → null
            viewModel.save()
            advanceUntilIdle()

            val update = repository.updateCalls.single()
            assertEquals("Lucas A. Silva", update.fullName)
            assertEquals("Campinas", update.addressCity)
            assertEquals("SP", update.addressState) // UF uppercased on parse
            assertNull(update.phone)
            assertNull(update.cpf) // locked → omitted
            assertNull(update.rg)
            val state = viewModel.uiState.value
            assertEquals(R.string.profile_saved, state.noticeRes)
            assertFalse(state.noticeIsError)
            // The refreshed response re-primed the form.
            assertEquals("Lucas A. Silva", state.form.fullName)
        }

    @Test
    fun `save sends a filled cpf while unlocked`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Success(
            alunoProfile(cpf = null, cpfLocked = false, rg = null, rgLocked = false),
        )
        repository.updateResult = ApiResult.Success(alunoProfile())
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()

        viewModel.updateCpf("123.456.789-09")
        viewModel.updateRg("12.345.678-9")
        viewModel.save()
        advanceUntilIdle()

        val update = repository.updateCalls.single()
        assertEquals("12345678909", update.cpf)
        assertEquals("12.345.678-9", update.rg)
    }

    @Test
    fun `a validation 422 lands on the matching fields`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Success(alunoProfile())
        repository.updateResult = ApiResult.Failure(
            ApiError.Validation(
                mapOf(
                    "addressState" to listOf("UF inválida"),
                    "addressZip" to listOf("CEP inválido"),
                    "phone" to listOf("Telefone inválido"),
                ),
            ),
        )
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()

        viewModel.save()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(R.string.profile_error_uf, state.fieldErrors[ProfileField.CITY_UF])
        assertEquals(R.string.profile_error_cep, state.fieldErrors[ProfileField.CEP])
        assertEquals(R.string.profile_error_phone, state.fieldErrors[ProfileField.PHONE])
        assertNull(state.noticeRes) // field errors own the message — no double notice
        assertFalse(state.saving)
    }

    @Test
    fun `a field_locked 422 lands on the cpf input with the locked copy`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Success(
            alunoProfile(cpf = null, cpfLocked = false, rg = null, rgLocked = false),
        )
        repository.updateResult =
            ApiResult.Failure(ApiError.Profile.FieldLocked(listOf("cpf")))
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()

        viewModel.updateCpf("98765432100")
        viewModel.save()
        advanceUntilIdle()

        assertEquals(
            R.string.error_profile_field_locked,
            viewModel.uiState.value.fieldErrors[ProfileField.CPF],
        )
    }

    @Test
    fun `a blank name never reaches the server`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Success(alunoProfile())
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()

        viewModel.updateFullName("   ")
        viewModel.save()
        advanceUntilIdle()

        assertTrue(repository.updateCalls.isEmpty())
        assertEquals(
            R.string.profile_error_full_name,
            viewModel.uiState.value.fieldErrors[ProfileField.FULL_NAME],
        )
    }

    @Test
    fun `a transport failure surfaces the screen-level notice`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Success(alunoProfile())
        repository.updateResult = ApiResult.Failure(ApiError.Network)
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()

        viewModel.save()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(R.string.error_network, state.noticeRes)
        assertTrue(state.noticeIsError)
        assertTrue(state.fieldErrors.isEmpty())
    }

    @Test
    fun `editing a field clears its error and the notice`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Success(alunoProfile())
        repository.updateResult = ApiResult.Failure(
            ApiError.Validation(mapOf("phone" to listOf("Telefone inválido"))),
        )
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()
        viewModel.save()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.fieldErrors.isNotEmpty())

        viewModel.updatePhone("(11) 90000-0000")

        assertNull(viewModel.uiState.value.fieldErrors[ProfileField.PHONE])
    }

    @Test
    fun `load failure surfaces mapped PT-BR copy and refresh retries`() = runTest {
        val repository = FakeProfileRepository()
        repository.profileResult = ApiResult.Failure(ApiError.Timeout)
        val viewModel = DadosPessoaisViewModel(repository)
        advanceUntilIdle()

        assertEquals(
            ProfileLoadState.Error(R.string.error_timeout),
            viewModel.uiState.value.load,
        )

        repository.profileResult = ApiResult.Success(alunoProfile())
        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.load is ProfileLoadState.Loaded)
        assertEquals(2, repository.profileCalls)
    }
}
