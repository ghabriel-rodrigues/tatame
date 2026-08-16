package br.com.tatame.feature.rankings

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.RankingBys
import br.com.tatame.testutil.FakeRankingsRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.rankingResponse
import br.com.tatame.testutil.rankingRow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** REP.14 — ranking segments state over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class RankingViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `init loads the lessons segment only`() = runTest {
        val repository = FakeRankingsRepository()
        repository.lessonsResult = ApiResult.Success(rankingResponse())
        val viewModel = RankingViewModel(repository)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(RankingSegment.LESSONS, state.segment)
        val loaded = state.lessons as RankingSegmentState.Loaded
        assertEquals(3, loaded.ranking.top.size)
        assertEquals(2, loaded.ranking.me?.position)
        assertNull(state.events) // lazy — the semester read waits for the segment
        assertEquals(listOf(RankingBys.LESSONS to null), repository.rankingCalls)
    }

    @Test
    fun `selecting eventos loads the semester segment once`() = runTest {
        val repository = FakeRankingsRepository()
        repository.lessonsResult = ApiResult.Success(rankingResponse())
        repository.eventsResult = ApiResult.Success(
            rankingResponse(by = RankingBys.EVENTS, windowLabel = "2026-S2"),
        )
        val viewModel = RankingViewModel(repository)
        advanceUntilIdle()

        viewModel.selectSegment(RankingSegment.EVENTS)
        advanceUntilIdle()
        viewModel.selectSegment(RankingSegment.LESSONS)
        viewModel.selectSegment(RankingSegment.EVENTS)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(RankingSegment.EVENTS, state.segment)
        assertEquals(
            "2026-S2",
            (state.events as RankingSegmentState.Loaded).ranking.window.label,
        )
        // One lessons read + one events read — re-selecting never refetches.
        assertEquals(
            listOf(RankingBys.LESSONS to null, RankingBys.EVENTS to null),
            repository.rankingCalls,
        )
    }

    @Test
    fun `the vocé row and the below-the-cut me survive the mapping untouched`() = runTest {
        val repository = FakeRankingsRepository()
        repository.lessonsResult = ApiResult.Success(
            rankingResponse(
                top = (1..10).map { rankingRow(it, isMe = false) },
                me = br.com.tatame.core.network.dto.RankingMe(position = 14, count = 3),
            ),
        )
        val viewModel = RankingViewModel(repository)
        advanceUntilIdle()

        val ranking = (viewModel.uiState.value.lessons as RankingSegmentState.Loaded).ranking
        assertTrue(ranking.top.none { it.isMe })
        assertEquals(14, ranking.me?.position) // the screen renders the extra own row
    }

    @Test
    fun `professor payload keeps me null`() = runTest {
        val repository = FakeRankingsRepository()
        repository.lessonsResult = ApiResult.Success(rankingResponse(me = null))
        val viewModel = RankingViewModel(repository)
        advanceUntilIdle()

        assertNull((viewModel.uiState.value.lessons as RankingSegmentState.Loaded).ranking.me)
    }

    @Test
    fun `failure surfaces mapped PT-BR copy and refresh retries the selected segment`() = runTest {
        val repository = FakeRankingsRepository()
        repository.lessonsResult = ApiResult.Failure(ApiError.Network)
        val viewModel = RankingViewModel(repository)
        advanceUntilIdle()

        assertEquals(
            RankingSegmentState.Error(R.string.error_network),
            viewModel.uiState.value.lessons,
        )

        repository.lessonsResult = ApiResult.Success(rankingResponse())
        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.lessons is RankingSegmentState.Loaded)
        assertEquals(2, repository.rankingCalls.size)
    }

    @Test
    fun `an events failure never touches the loaded lessons segment`() = runTest {
        val repository = FakeRankingsRepository()
        repository.lessonsResult = ApiResult.Success(rankingResponse())
        repository.eventsResult = ApiResult.Failure(ApiError.Timeout)
        val viewModel = RankingViewModel(repository)
        advanceUntilIdle()

        viewModel.selectSegment(RankingSegment.EVENTS)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(RankingSegmentState.Error(R.string.error_timeout), state.events)
        assertTrue(state.lessons is RankingSegmentState.Loaded)
    }
}
