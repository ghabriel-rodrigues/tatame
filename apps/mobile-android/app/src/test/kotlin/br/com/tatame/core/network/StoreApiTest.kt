package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.CreateChargePaymentRequest
import br.com.tatame.core.network.dto.CreateOrderRequest
import br.com.tatame.core.network.dto.OrderStatuses
import br.com.tatame.core.network.dto.PaymentMethods
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * STO.12/13 — hand-written [StoreApi] against MockWebServer: paths, verbs,
 * query params and spec-mirroring DTO decoding (same doctrine as
 * EventsApiTest). Also pins the `storeStrip` array folded into the existing
 * aluno home response (spec 009 fills the stable contract shape-additively)
 * and the nullable `Charge.studentId` relaxation for professor buyers.
 */
class StoreApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: StoreApi

    private val vitrineJson = """
        {"products":[
           {"id":"pr1","name":"Kimono oficial Horizonte","priceCents":38900,
            "monogram":"GI","gradientPreset":"store-blue-purple",
            "categoryId":"cat1","categoryName":"Kimonos"},
           {"id":"pr2","name":"Rash guard manga longa","priceCents":14900,
            "monogram":"RG","gradientPreset":"store-pink-purple",
            "categoryId":null,"categoryName":null}],
         "categories":[{"id":"cat1","name":"Kimonos"},{"id":"cat2","name":"Acessórios"}]}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(StoreApi::class.java)
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

    // ---- vitrine ---------------------------------------------------------

    @Test
    fun `vitrine decodes products and the chip carousel data`() = runBlocking {
        enqueueJson(vitrineJson)

        val response = api.vitrine()

        assertEquals("/v1/store/products", server.takeRequest().path)
        assertEquals(2, response.products.size)
        assertEquals("GI", response.products[0].monogram)
        assertNull(response.products[1].categoryName)
        assertEquals(listOf("Kimonos", "Acessórios"), response.categories.map { it.name })
    }

    @Test
    fun `vitrine passes search and category as query params`() = runBlocking {
        enqueueJson("""{"products":[],"categories":[]}""")

        api.vitrine(search = "kimono", categoryId = "cat1")

        assertEquals(
            "/v1/store/products?search=kimono&categoryId=cat1",
            server.takeRequest().path,
        )
    }

    @Test
    fun `productDetail decodes the aluno-17 payload`() = runBlocking {
        enqueueJson(
            """
            {"id":"pr1","name":"Kimono oficial Horizonte","priceCents":38900,
             "monogram":"GI","gradientPreset":"store-blue-purple",
             "categoryId":"cat1","categoryName":"Kimonos",
             "description":"Trançado leve com bordados oficiais.",
             "tags":["kimono","gi"],"sizes":["P","M","G","GG"],"stockQty":12}
            """.trimIndent(),
        )

        val response = api.productDetail("pr1")

        assertEquals("/v1/store/products/pr1", server.takeRequest().path)
        assertEquals(listOf("P", "M", "G", "GG"), response.sizes)
        assertEquals(12, response.stockQty)
        assertEquals(listOf("kimono", "gi"), response.tags)
    }

    // ---- purchase --------------------------------------------------------

    @Test
    fun `createOrder posts the size and quantity and decodes the charge id`() = runBlocking {
        enqueueJson(
            """
            {"order":{"id":"or1","number":2431,"status":"pending","totalCents":38900,
              "pickupNote":"Retirada na recepção","createdAt":"2026-08-10T12:00:00.000Z",
              "item":{"productId":"pr1","productName":"Kimono oficial Horizonte",
                "monogram":"GI","gradientPreset":"store-blue-purple",
                "size":"M","quantity":1,"unitPriceCents":38900},
              "chargeId":"ch-or1"},
             "chargeId":"ch-or1"}
            """.trimIndent(),
            code = 201,
        )

        val response = api.createOrder(
            CreateOrderRequest(productId = "pr1", size = "M", quantity = 1),
        )

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/store/orders", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains(""""productId":"pr1""""))
        assertTrue(body.contains(""""size":"M""""))
        assertTrue(body.contains(""""quantity":1"""))
        assertEquals(2431, response.order.number)
        assertEquals(OrderStatuses.PENDING, response.order.status)
        assertEquals("ch-or1", response.chargeId)
        assertEquals(38_900L, response.order.item?.unitPriceCents)
    }

    @Test
    fun `myOrders decodes the pedidos list`() = runBlocking {
        enqueueJson(
            """
            {"orders":[
              {"id":"or1","number":2431,"status":"paid","totalCents":38900,
               "pickupNote":"Retirada na recepção","createdAt":"2026-08-10T12:00:00.000Z",
               "item":{"productId":"pr1","productName":"Kimono oficial Horizonte",
                 "monogram":"GI","gradientPreset":"store-blue-purple",
                 "size":null,"quantity":2,"unitPriceCents":7900},
               "chargeId":null}]}
            """.trimIndent(),
        )

        val response = api.myOrders()

        assertEquals("/v1/store/orders", server.takeRequest().path)
        val order = response.orders.single()
        assertEquals(OrderStatuses.PAID, order.status)
        assertNull(order.item?.size) // sizeless product
        assertNull(order.chargeId) // only pending orders carry the open charge
    }

    @Test
    fun `cancelOrder deletes the pending order`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))

        api.cancelOrder("or1")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/v1/store/orders/or1", request.path)
    }

    @Test
    fun `pay posts pix on the persona-neutral store charge route`() = runBlocking {
        enqueueJson(
            """
            {"payment":{"id":"pay1","chargeId":"ch-or1","method":"pix","status":"pending",
              "amountCents":38900,"currency":"BRL","provider":"simulated",
              "providerData":{"qrPayload":"TATAME-SIM-PIX-ch-or1","copiaECola":"TATAME-SIM-PIX-ch-or1"}},
             "charge":{"id":"ch-or1","studentId":null,"status":"open","overdue":false,
              "amountCents":38900,"currency":"BRL","dueDate":"2026-08-10"},
             "mandateCreated":false}
            """.trimIndent(),
            code = 201,
        )

        val response = api.pay("ch-or1", CreateChargePaymentRequest(method = PaymentMethods.PIX))

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/store/charges/ch-or1/payments", request.path)
        assertEquals(PaymentMethods.PIX, response.payment.method)
        // Professor buyer: order charge with no student row (spec 009 relaxation).
        assertNull(response.charge.studentId)
    }

    // ---- storeStrip folded into the existing home contract ---------------

    @Test
    fun `aluno home decodes the storeStrip array`() {
        val home = ProblemJson.decodeFromString(
            AlunoHomeResponse.serializer(),
            """
            {"student":{"id":"st1","fullName":"Lucas Almeida"},
             "stats":{"monthPresencePct":86,"monthAttendedSessions":12,"monthTotalSessions":14,
                      "streak":6,"totalLessons":26},
             "upcomingEvents":[],
             "storeStrip":[{"id":"pr1","name":"Kimono oficial Horizonte","priceCents":38900,
               "monogram":"GI","gradientPreset":"store-blue-purple",
               "categoryId":"cat1","categoryName":"Kimonos"}]}
            """.trimIndent(),
        )
        assertEquals("GI", home.storeStrip.single().monogram)
        assertEquals(38_900L, home.storeStrip.single().priceCents)
    }
}
