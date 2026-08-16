package br.com.tatame.feature.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** REP.13 — pure mask/parse rules of the Dados pessoais surface. */
class ProfileFormatTest {

    @Test
    fun `formatCpf masks 11 digits and passes anything else through`() {
        assertEquals("123.456.789-09", ProfileFormat.formatCpf("12345678909"))
        assertEquals("1234", ProfileFormat.formatCpf("1234"))
        assertEquals("", ProfileFormat.formatCpf(""))
    }

    @Test
    fun `formatCep masks 8 digits and passes anything else through`() {
        assertEquals("01310-100", ProfileFormat.formatCep("01310100"))
        assertEquals("0131", ProfileFormat.formatCep("0131"))
    }

    @Test
    fun `formatBirthDate renders BR order and survives garbage`() {
        assertEquals("14/03/1998", ProfileFormat.formatBirthDate("1998-03-14"))
        assertEquals("not-a-date", ProfileFormat.formatBirthDate("not-a-date"))
    }

    @Test
    fun `cityUfLine composes the single input from the two columns`() {
        assertEquals("São Paulo / SP", ProfileFormat.cityUfLine("São Paulo", "SP"))
        assertEquals("São Paulo", ProfileFormat.cityUfLine("São Paulo", null))
        assertEquals("SP", ProfileFormat.cityUfLine(null, "SP"))
        assertEquals("", ProfileFormat.cityUfLine(null, null))
    }

    @Test
    fun `parseCityUf splits on the last slash and uppercases the UF`() {
        assertEquals("São Paulo" to "SP", ProfileFormat.parseCityUf("São Paulo / sp"))
        assertEquals("São Paulo" to "SP", ProfileFormat.parseCityUf("  São Paulo/SP  "))
        // Slash inside the city name: only the last one separates the UF.
        assertEquals("Embu/Guaçu" to "SP", ProfileFormat.parseCityUf("Embu/Guaçu/SP"))
    }

    @Test
    fun `parseCityUf without a separator reads as city only`() {
        assertEquals("Campinas" to null, ProfileFormat.parseCityUf("Campinas"))
    }

    @Test
    fun `parseCityUf clears both on blank input`() {
        val (city, uf) = ProfileFormat.parseCityUf("   ")
        assertNull(city)
        assertNull(uf)
    }

    @Test
    fun `digitsOnly strips the mask from pasted documents`() {
        assertEquals("12345678909", ProfileFormat.digitsOnly("123.456.789-09"))
        assertEquals("01310100", ProfileFormat.digitsOnly("01310-100"))
    }
}
