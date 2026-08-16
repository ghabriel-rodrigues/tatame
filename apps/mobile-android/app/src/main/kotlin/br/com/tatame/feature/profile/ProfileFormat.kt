package br.com.tatame.feature.profile

import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Pure PT-BR formatting/parsing for the Dados pessoais surface (REP.13,
 * aluno-18) — JVM-testable. The server stores normalized digits (CPF 11,
 * CEP 8) and a 2-letter UF; clients render the masks and parse the single
 * "Cidade / UF" input back into the two typed columns on save.
 */
object ProfileFormat {

    private val ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE
    private val BR_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    /** "12345678900" → "123.456.789-00"; anything not 11 digits passes through. */
    fun formatCpf(digits: String): String {
        if (!digits.matches(Regex("^[0-9]{11}$"))) return digits
        return "${digits.substring(0, 3)}.${digits.substring(3, 6)}" +
            ".${digits.substring(6, 9)}-${digits.substring(9)}"
    }

    /** "01310100" → "01310-100"; anything not 8 digits passes through. */
    fun formatCep(digits: String): String {
        if (!digits.matches(Regex("^[0-9]{8}$"))) return digits
        return "${digits.substring(0, 5)}-${digits.substring(5)}"
    }

    /** "2000-03-15" → "15/03/2000" (read-only nascimento box); raw on parse failure. */
    fun formatBirthDate(isoDate: String): String = runCatching {
        LocalDate.parse(isoDate, ISO_DATE).format(BR_DATE)
    }.getOrDefault(isoDate)

    /** ("São Paulo", "SP") → "São Paulo / SP"; partials render what exists. */
    fun cityUfLine(city: String?, uf: String?): String = when {
        !city.isNullOrBlank() && !uf.isNullOrBlank() -> "$city / $uf"
        !city.isNullOrBlank() -> city
        !uf.isNullOrBlank() -> uf
        else -> ""
    }

    /**
     * "São Paulo / SP" → ("São Paulo", "SP"). The UF half is uppercased; a
     * missing separator reads as city-only (UF cleared); blank input clears
     * both. Server-side UF validation is the authority (27 federative units).
     */
    fun parseCityUf(input: String): Pair<String?, String?> {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return null to null
        val slash = trimmed.lastIndexOf('/')
        if (slash < 0) return trimmed to null
        val city = trimmed.substring(0, slash).trim().ifEmpty { null }
        val uf = trimmed.substring(slash + 1).trim().uppercase().ifEmpty { null }
        return city to uf
    }

    /** Keeps only digits (CPF/CEP inputs accept masked paste). */
    fun digitsOnly(raw: String): String = raw.filter(Char::isDigit)
}
