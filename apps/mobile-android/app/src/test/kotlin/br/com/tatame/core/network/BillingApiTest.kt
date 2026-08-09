package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.CardDetails
import br.com.tatame.core.network.dto.ChargeStatuses
import br.com.tatame.core.network.dto.CreateChargePaymentRequest
import br.com.tatame.core.network.dto.DependentListResponse
import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.core.network.dto.PaymentProviders
import br.com.tatame.core.network.dto.PaymentStatuses
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * BIL.19–21 — hand-written [BillingApi] against MockWebServer: paths, verbs,
 * request bodies, and spec-mirroring DTO decoding (same doctrine as
 * GraduationApiTest). Also covers the mensalidade alert folded into the aluno
 * home and dependent list responses (spec 006, stories 7/22).
 */
class BillingApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: BillingApi

    private val chargeJson = """
        {"id":"ch1","studentId":"st1","guardianId":null,"status":"open","overdue":false,
         "amountCents":18000,"currency":"BRL","dueDate":"2026-08-10",
         "periodStart":"2026-08-01","periodEnd":"2026-08-31","academyPlanId":"pl1"}
    """.trimIndent()

    private val planJson = """
        {"id":"pl1","name":"Mensal","amountCents":18000,"currency":"BRL",
         "recurrence":"monthly","dueDay":10,"isActive":true}
    """.trimIndent()

    private fun paymentJson(
        status: String = "pending",
        method: String = "pix",
        provider: String = "simulated",
    ) = """
        {"id":"pay1","chargeId":"ch1","method":"$method","status":"$status",
         "amountCents":18000,"currency":"BRL","provider":"$provider",
         "providerData":{"qrPayload":"TATAME-SIM-PIX-ch1","copiaECola":"TATAME-SIM-PIX-ch1"},
         "paidAt":null,"receiptUrl":null}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(BillingApi::class.java)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun enqueueJson(body: String, code: Int = 200) {
        server.enqueue(
            MockResponse().setResponseCode(code)
                .setHeader("Content-Type", "application/json")
                .setBody(body),
        )
    }

    // ---- aluno Carteira (BIL.19) -----------------------------------------

    @Test
    fun `wallet decodes plan current charge recurrence and historico`() = runBlocking {
        enqueueJson(
            """
            {"student":{"id":"st1","fullName":"Lucas Almeida"},
             "plan":$planJson,
             "currentCharge":{"id":"ch1","studentId":"st1","guardianId":null,"status":"open",
               "overdue":false,"amountCents":18000,"currency":"BRL","dueDate":"2026-08-10",
               "periodStart":"2026-08-01","periodEnd":"2026-08-31","academyPlanId":"pl1",
               "payments":[${paymentJson()}]},
             "recurrence":{"active":true,"nextChargeDueDate":"2026-09-01"},
             "history":[{"studentId":"st1","chargeId":"ch0","periodStart":"2026-07-01",
               "amountCents":18000,"currency":"BRL","chargeStatus":"paid","paymentId":"pay0",
               "method":"pix","paidAt":"2026-07-08T12:00:00.000Z","receiptUrl":null}]}
            """.trimIndent(),
        )

        val response = api.wallet()

        assertEquals("/v1/aluno/wallet", server.takeRequest().path)
        assertEquals("Mensal", response.plan?.name)
        assertEquals(18_000L, response.plan?.amountCents)
        assertEquals(10, response.plan?.dueDay)
        assertEquals(ChargeStatuses.OPEN, response.currentCharge?.status)
        assertEquals(
            "TATAME-SIM-PIX-ch1",
            response.currentCharge?.payments?.single()?.providerData?.qrPayload,
        )
        assertTrue(response.recurrence.active)
        assertEquals("2026-09-01", response.recurrence.nextChargeDueDate)
        assertEquals(PaymentMethods.PIX, response.history.single().method)
    }

    @Test
    fun `wallet tolerates the no-plan empty state`() = runBlocking {
        enqueueJson(
            """
            {"student":{"id":"st1","fullName":"Lucas Almeida"},
             "plan":null,"currentCharge":null,
             "recurrence":{"active":false,"nextChargeDueDate":null},"history":[]}
            """.trimIndent(),
        )

        val response = api.wallet()

        assertNull(response.plan)
        assertNull(response.currentCharge)
        assertFalse(response.recurrence.active)
        assertTrue(response.history.isEmpty())
    }

    @Test
    fun `pay posts pix without recurrence or card fields`() = runBlocking {
        enqueueJson(
            """{"payment":${paymentJson()},"charge":$chargeJson,"mandateCreated":false}""",
            code = 201,
        )

        val response = api.pay("ch1", CreateChargePaymentRequest(method = PaymentMethods.PIX))

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/aluno/wallet/charges/ch1/payments", request.path)
        // explicitNulls=false drops the card-only fields — one write path, one payload.
        assertEquals("""{"method":"pix"}""", request.body.readUtf8())
        assertEquals(PaymentProviders.SIMULATED, response.payment.provider)
        assertFalse(response.mandateCreated)
    }

    @Test
    fun `pay posts card with recurrence toggle and display metadata`() = runBlocking {
        enqueueJson(
            """
            {"payment":${paymentJson(status = "succeeded", method = "card")},
             "charge":$chargeJson,"mandateCreated":true}
            """.trimIndent(),
            code = 201,
        )

        val response = api.pay(
            "ch1",
            CreateChargePaymentRequest(
                method = PaymentMethods.CARD,
                recurrence = true,
                card = CardDetails(holderName = "LUCAS ALMEIDA", last4 = "4242"),
            ),
        )

        assertEquals(
            """{"method":"card","recurrence":true,""" +
                """"card":{"holderName":"LUCAS ALMEIDA","last4":"4242"}}""",
            server.takeRequest().body.readUtf8(),
        )
        assertEquals(PaymentStatuses.SUCCEEDED, response.payment.status)
        assertTrue(response.mandateCreated)
    }

    @Test
    fun `cancelMandate deletes the wallet mandate`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))

        api.cancelMandate()

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/v1/aluno/wallet/mandate", request.path)
    }

    // ---- responsável Pagamentos (BIL.21) ---------------------------------

    @Test
    fun `guardianPayments decodes dependents and consolidated historico`() = runBlocking {
        enqueueJson(
            """
            {"dependents":[{"studentId":"dst1","fullName":"Pedro Silveira",
               "plan":{"id":"pl-kids","name":"Kids","amountCents":15000,"currency":"BRL",
                 "recurrence":"monthly","dueDay":10,"isActive":true},
               "currentCharge":{"id":"dch1","studentId":"dst1","guardianId":"g1","status":"open",
                 "overdue":false,"amountCents":15000,"currency":"BRL","dueDate":"2026-08-10",
                 "periodStart":"2026-08-01","periodEnd":"2026-08-31","academyPlanId":"pl-kids",
                 "payments":[]},
               "recurrenceActive":false},
              {"studentId":"dst2","fullName":"Júlia Silveira","plan":null,
               "currentCharge":null,"recurrenceActive":true}],
             "history":[{"studentId":"dst1","chargeId":"dch0","periodStart":"2026-07-01",
               "amountCents":15000,"currency":"BRL","chargeStatus":"paid","paymentId":"dpay0",
               "method":"card","paidAt":"2026-08-02T12:00:00.000Z","receiptUrl":null,
               "studentName":"Pedro Silveira"}]}
            """.trimIndent(),
        )

        val response = api.guardianPayments()

        assertEquals("/v1/responsavel/payments", server.takeRequest().path)
        assertEquals(2, response.dependents.size)
        assertEquals("Kids", response.dependents[0].plan?.name)
        assertEquals("g1", response.dependents[0].currentCharge?.guardianId)
        assertTrue(response.dependents[1].recurrenceActive)
        assertNull(response.dependents[1].plan)
        assertEquals("Pedro Silveira", response.history.single().studentName)
    }

    @Test
    fun `guardianPay rides the responsavel charge path`() = runBlocking {
        enqueueJson(
            """{"payment":${paymentJson()},"charge":$chargeJson,"mandateCreated":false}""",
            code = 201,
        )

        api.guardianPay("dch1", CreateChargePaymentRequest(method = PaymentMethods.PIX))

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/responsavel/payments/charges/dch1/payments", request.path)
        assertEquals("""{"method":"pix"}""", request.body.readUtf8())
    }

    // ---- shared (simulate + comprovante, BIL.20) -------------------------

    @Test
    fun `simulate posts to the gated billing route and decodes the settle`() = runBlocking {
        enqueueJson(
            """
            {"payment":${paymentJson(status = "succeeded")},
             "charge":{"id":"ch1","studentId":"st1","guardianId":null,"status":"paid",
               "overdue":false,"amountCents":18000,"currency":"BRL","dueDate":"2026-08-10",
               "periodStart":"2026-08-01","periodEnd":"2026-08-31","academyPlanId":"pl1"}}
            """.trimIndent(),
        )

        val response = api.simulate("pay1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/billing/payments/pay1/simulate", request.path)
        assertEquals(PaymentStatuses.SUCCEEDED, response.payment.status)
        assertEquals(ChargeStatuses.PAID, response.charge.status)
    }

    @Test
    fun `receipt decodes the comprovante payload`() = runBlocking {
        enqueueJson(
            """
            {"payment":${paymentJson(status = "succeeded")},"charge":$chargeJson,
             "studentName":"Lucas Almeida","planName":"Mensal","academyName":"Horizonte BJJ"}
            """.trimIndent(),
        )

        val response = api.receipt("pay1")

        assertEquals("/v1/billing/payments/pay1/receipt", server.takeRequest().path)
        assertEquals("Lucas Almeida", response.studentName)
        assertEquals("Horizonte BJJ", response.academyName)
    }

    // ---- mensalidade alerts folded into existing responses ---------------

    @Test
    fun `home and dependents responses decode the folded mensalidade alert`() {
        val home = ProblemJson.decodeFromString(
            AlunoHomeResponse.serializer(),
            """
            {"student":{"id":"st1","fullName":"Lucas Almeida"},
             "stats":{"monthPresencePct":86,"monthAttendedSessions":12,"monthTotalSessions":14,
                      "streak":6,"totalLessons":26},
             "mensalidade":{"chargeId":"ch1","amountCents":18000,"currency":"BRL",
                            "dueDate":"2026-08-10","overdue":true,"periodStart":"2026-08-01"}}
            """.trimIndent(),
        )
        assertEquals("ch1", home.mensalidade?.chargeId)
        assertTrue(home.mensalidade?.overdue == true)

        val dependents = ProblemJson.decodeFromString(
            DependentListResponse.serializer(),
            """
            {"dependents":[{"id":"d1","fullName":"Pedro Silveira","birthDate":"2017-06-10",
              "status":"active","class":null,
              "mensalidade":{"chargeId":"dch1","amountCents":15000,"currency":"BRL",
                             "dueDate":"2026-08-10","overdue":false,"periodStart":null}}]}
            """.trimIndent(),
        )
        assertEquals(15_000L, dependents.dependents.single().mensalidade?.amountCents)
        assertFalse(dependents.dependents.single().mensalidade?.overdue == true)
    }
}
