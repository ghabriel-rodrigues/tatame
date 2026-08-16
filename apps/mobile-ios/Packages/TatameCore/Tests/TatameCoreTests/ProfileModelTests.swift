import Foundation
import Testing
@testable import TatameCore

@Suite("Profile domain model + formatters (spec 013, REP.16)")
struct ProfileModelTests {
    @Test("CPF mask renders the aluno-18 format and passes raw fallbacks through")
    func cpfMask() {
        #expect(ProfileFormatters.cpfMask("12345678900") == "123.456.789-00")
        #expect(ProfileFormatters.cpfMask("123") == "123")
        #expect(ProfileFormatters.cpfMask("1234567890a") == "1234567890a")
    }

    @Test("CEP mask renders 01310-100 and passes raw fallbacks through")
    func cepMask() {
        #expect(ProfileFormatters.cepMask("01310100") == "01310-100")
        #expect(ProfileFormatters.cepMask("0131") == "0131")
    }

    @Test("birth date renders dd/MM/yyyy from the ISO fact")
    func birthDate() {
        #expect(ProfileFormatters.birthDateBR("1998-03-14") == "14/03/1998")
        #expect(ProfileFormatters.birthDateBR("garbage") == "garbage")
    }

    @Test("Cidade / UF composes and parses back into the two typed columns")
    func cityUF() {
        #expect(ProfileFormatters.cityUF(city: "São Paulo", uf: "SP") == "São Paulo / SP")
        #expect(ProfileFormatters.cityUF(city: "São Paulo", uf: nil) == "São Paulo")
        #expect(ProfileFormatters.cityUF(city: nil, uf: nil) == "")

        let parsed = ProfileFormatters.parseCityUF("São Paulo / sp")
        #expect(parsed.city == "São Paulo")
        #expect(parsed.uf == "SP")

        let cityOnly = ProfileFormatters.parseCityUF("Campinas")
        #expect(cityOnly.city == "Campinas")
        #expect(cityOnly.uf == nil)

        let empty = ProfileFormatters.parseCityUF("   ")
        #expect(empty.city == nil)
        #expect(empty.uf == nil)
    }

    @Test("gender labels read PT-BR")
    func genderLabels() {
        #expect(Gender.female.labelPTBR == "Feminino")
        #expect(Gender.male.labelPTBR == "Masculino")
        #expect(Gender.other.labelPTBR == "Outro")
        #expect(Gender.unspecified.labelPTBR == "Prefiro não informar")
    }
}
