package br.com.tatame.core.attendance

import br.com.tatame.core.network.ApiConfig
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.dto.LiveStreamCheckinEvent
import br.com.tatame.core.network.dto.LiveStreamRevokeEvent
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.channels.trySendBlocking
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

/** One parsed server-sent event of the live chamada stream (spec 004 realtime contract). */
sealed interface LiveStreamEvent {
    /** The stream connected (2xx + event-stream) — resets the drop counter upstream. */
    data object Opened : LiveStreamEvent

    data class Checkin(val payload: LiveStreamCheckinEvent) : LiveStreamEvent

    data class Revoke(val payload: LiveStreamRevokeEvent) : LiveStreamEvent

    /** 20 s server heartbeat — observable but carries nothing. */
    data object Heartbeat : LiveStreamEvent
}

/** Raised into the flow when the stream fails to connect or drops. */
class LiveStreamException(message: String, cause: Throwable? = null) : IOException(message, cause)

/**
 * Seam for the SSE transport (fakeable in JVM tests). The flow emits
 * [LiveStreamEvent]s while connected, completes when the server closes the
 * stream, and fails with [LiveStreamException] on connect/drop errors —
 * reconnect/fallback policy lives in the ViewModel, not here.
 */
interface LiveStreamClient {
    fun stream(liveCodeId: String, ticket: String): Flow<LiveStreamEvent>
}

/**
 * okhttp-sse implementation per the resolved realtime decision
 * (.scratch/backend/issues/09): named events `checkin` / `revoke` /
 * `heartbeat`, short-lived signed ticket in the query string (EventSource
 * cannot set per-request auth headers), read timeout disabled so the 20 s
 * heartbeat keeps an idle mat open.
 */
class OkHttpLiveStreamClient(
    baseClient: OkHttpClient,
    private val apiConfig: ApiConfig,
    private val json: Json = ProblemJson,
) : LiveStreamClient {

    private val client: OkHttpClient = baseClient.newBuilder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    override fun stream(liveCodeId: String, ticket: String): Flow<LiveStreamEvent> = callbackFlow {
        val url = apiConfig.baseUrl.toHttpUrl().newBuilder()
            .addPathSegments("v1/professor/live-codes/$liveCodeId/stream")
            .addQueryParameter("ticket", ticket)
            .build()
        val request = Request.Builder()
            .url(url)
            .header("Accept", "text/event-stream")
            .build()

        val source = EventSources.createFactory(client).newEventSource(
            request,
            object : EventSourceListener() {
                override fun onOpen(eventSource: EventSource, response: Response) {
                    trySendBlocking(LiveStreamEvent.Opened)
                }

                override fun onEvent(
                    eventSource: EventSource,
                    id: String?,
                    type: String?,
                    data: String,
                ) {
                    when (type) {
                        EVENT_CHECKIN -> runCatching {
                            json.decodeFromString<LiveStreamCheckinEvent>(data)
                        }.onSuccess { trySendBlocking(LiveStreamEvent.Checkin(it)) }
                        EVENT_REVOKE -> runCatching {
                            json.decodeFromString<LiveStreamRevokeEvent>(data)
                        }.onSuccess { trySendBlocking(LiveStreamEvent.Revoke(it)) }
                        EVENT_HEARTBEAT -> trySendBlocking(LiveStreamEvent.Heartbeat)
                        // Unknown event names are ignored — registry may grow.
                    }
                }

                override fun onClosed(eventSource: EventSource) {
                    close() // server ended the stream — normal completion
                }

                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    close(
                        LiveStreamException(
                            "live stream failure (http ${response?.code ?: "none"})",
                            t,
                        ),
                    )
                }
            },
        )

        awaitClose { source.cancel() }
    }

    private companion object {
        const val EVENT_CHECKIN = "checkin"
        const val EVENT_REVOKE = "revoke"
        const val EVENT_HEARTBEAT = "heartbeat"
    }
}
