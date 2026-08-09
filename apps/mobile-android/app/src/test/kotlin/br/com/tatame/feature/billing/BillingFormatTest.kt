package br.com.tatame.feature.billing

import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.testutil.plan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** BIL.19–21 — pure PT-BR billing copy building (handoff aluno-12/responsavel-04). */
class BillingFormatTest {

    // ---- amounts (integer cents → pt-BR) ---------------------------------

    @Test
    fun `amountBRL formats cents with comma decimals and dot thousands`() {
        assertEquals("R$ 180,00", BillingFormat.amountBRL(18_000))
        assertEquals("R$ 150,00", BillingFormat.amountBRL(15_000))
        assertEquals("R$ 1.250,50", BillingFormat.amountBRL(125_050))
        assertEquals("R$ 0,05", BillingFormat.amountBRL(5))
        assertEquals("-R$ 12,34", BillingFormat.amountBRL(-1_234))
    }

    // ---- titles and dates -------------------------------------------------

    @Test
    fun `mensalidade titles follow the handoff month copy`() {
        assertEquals("Mensalidade · agosto", BillingFormat.mensalidadeTitle("2026-08-01"))
        assertEquals("Mensalidade", BillingFormat.mensalidadeTitle(null))
        assertEquals("Pedro · agosto", BillingFormat.dependentTitle("Pedro Silveira", "2026-08-01"))
        assertEquals("Pedro", BillingFormat.dependentTitle("Pedro Silveira", null))
    }

    @Test
    fun `sheet subtitle addresses academy or dependent`() {
        assertEquals(
            "Mensalidade de agosto · Horizonte BJJ",
            BillingFormat.sheetSubtitle("2026-08-01", "Horizonte BJJ"),
        )
        assertEquals(
            "Mensalidade de agosto · Pedro Silveira",
            BillingFormat.sheetSubtitle("2026-08-01", "Pedro Silveira"),
        )
        assertEquals("Mensalidade de agosto", BillingFormat.sheetSubtitle("2026-08-01", null))
    }

    @Test
    fun `date labels mirror the handoff copy`() {
        assertEquals("Vence em 10 de agosto", BillingFormat.dueLabel("2026-08-10"))
        assertEquals("1 de setembro", BillingFormat.longDate("2026-09-01"))
        assertEquals("10/08", BillingFormat.shortDay("2026-08-10"))
        assertEquals("08/07", BillingFormat.shortDate("2026-07-08T12:00:00.000Z"))
        assertNull(BillingFormat.shortDate(null))
        // Unparseable input falls back raw — money screens never crash on copy.
        assertEquals("not-a-date", BillingFormat.longDate("not-a-date"))
    }

    // ---- paid lines --------------------------------------------------------

    @Test
    fun `paid lines cover method and recurrence variants`() {
        assertEquals(
            "Pago em 08/07 · Pix",
            BillingFormat.paidLine("2026-07-08T12:00:00.000Z", PaymentMethods.PIX),
        )
        assertEquals(
            "Pago em 02/08 via recorrência no cartão",
            BillingFormat.paidLine(
                "2026-08-02T12:00:00.000Z",
                PaymentMethods.CARD,
                viaRecurrence = true,
            ),
        )
        // Recurrence flag never rewrites a non-card settle.
        assertEquals(
            "Pago em 02/08 · Pix",
            BillingFormat.paidLine(
                "2026-08-02T12:00:00.000Z",
                PaymentMethods.PIX,
                viaRecurrence = true,
            ),
        )
        assertEquals("Pago · boleto", BillingFormat.paidLine(null, PaymentMethods.BOLETO))
    }

    // ---- plan copy ---------------------------------------------------------

    @Test
    fun `plan header and suffix mirror the handoff`() {
        assertEquals(
            "Plano mensal recorrente · R$ 180,00",
            BillingFormat.planHeader(plan()),
        )
        assertEquals(
            "Plano trimestral recorrente · R$ 450,00",
            BillingFormat.planHeader(plan(amountCents = 45_000, recurrence = "quarterly")),
        )
        assertEquals(
            "plano Kids mensal",
            BillingFormat.planSuffix(plan(name = "Kids")),
        )
    }

    // ---- boleto stripes ----------------------------------------------------

    @Test
    fun `boleto modules are deterministic digit-derived with guards`() {
        val modules = BoletoBarcode.modules("34191.79001")
        // 4 guard + 10 digits + 4 guard, widths only 1 or 2.
        assertEquals(18, modules.size)
        assertTrue(modules.all { it == 1 || it == 2 })
        assertEquals(modules, BoletoBarcode.modules("34191.79001"))
        assertTrue(BoletoBarcode.modules("").isEmpty())
        assertTrue(BoletoBarcode.modules("no digits").isEmpty())
    }
}
