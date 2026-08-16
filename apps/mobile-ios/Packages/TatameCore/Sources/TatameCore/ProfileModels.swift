// Domain models for the aluno Dados pessoais slice (spec 013, REP.16).
// Mapped from the generated OpenAPI types inside TatameAPI — features only
// ever see these (ticket 02 convention). CPF/RG are write-once server-side;
// the `cpfLocked`/`rgLocked` flags drive the aluno-18 dashed lock boxes.

import Foundation

/// Gender values shared with the backend enum (`users.gender`).
public enum Gender: String, Sendable, Equatable, CaseIterable {
    case female
    case male
    case other
    case unspecified

    /// PT-BR display label (UI copy only — code stays English).
    public var labelPTBR: String {
        switch self {
        case .female: "Feminino"
        case .male: "Masculino"
        case .other: "Outro"
        case .unspecified: "Prefiro não informar"
        }
    }
}

/// GET /aluno/profile payload. Email and birth date are read-only identity
/// facts (birth date served from the linked student row — the age-rule
/// authority); everything else is the aluno's to maintain.
public struct AlunoProfile: Sendable, Equatable {
    public let fullName: String
    /// Read-only (login identity).
    public let email: String
    /// Read-only ISO "yyyy-MM-dd"; nil when no student row carries it.
    public let birthDate: String?
    public let phone: String?
    public let gender: Gender?
    /// 11 normalized digits — clients render the mask.
    public let cpf: String?
    /// True once set — the aluno-18 dashed lock state.
    public let cpfLocked: Bool
    public let rg: String?
    public let rgLocked: Bool
    public let addressLine: String?
    public let addressCity: String?
    /// UF, 2 uppercase letters.
    public let addressState: String?
    /// CEP, 8 normalized digits.
    public let addressZip: String?
    public let emergencyContactName: String?
    public let emergencyContactPhone: String?
    /// Avatars stay initials in v1 ("Trocar foto" is a placeholder).
    public let avatarUrl: String?

    public init(
        fullName: String,
        email: String,
        birthDate: String?,
        phone: String?,
        gender: Gender?,
        cpf: String?,
        cpfLocked: Bool,
        rg: String?,
        rgLocked: Bool,
        addressLine: String?,
        addressCity: String?,
        addressState: String?,
        addressZip: String?,
        emergencyContactName: String?,
        emergencyContactPhone: String?,
        avatarUrl: String?
    ) {
        self.fullName = fullName
        self.email = email
        self.birthDate = birthDate
        self.phone = phone
        self.gender = gender
        self.cpf = cpf
        self.cpfLocked = cpfLocked
        self.rg = rg
        self.rgLocked = rgLocked
        self.addressLine = addressLine
        self.addressCity = addressCity
        self.addressState = addressState
        self.addressZip = addressZip
        self.emergencyContactName = emergencyContactName
        self.emergencyContactPhone = emergencyContactPhone
        self.avatarUrl = avatarUrl
    }
}

/// One nullable field of the profile PUT: omitted (unchanged), set to a
/// value, or cleared with an explicit JSON null. Distinguishing "not sent"
/// from "send null" is the whole point — the backend treats absence as
/// "leave alone" and null as "clear".
public enum ProfileFieldUpdate<Value: Sendable & Equatable>: Sendable, Equatable {
    case unchanged
    case set(Value)
    case clear
}

/// PUT /aluno/profile payload (partial update). CPF/RG carry plain optional
/// strings (write-once fields are never cleared — nil = not sent); email and
/// birth date are intentionally unrepresentable (sending them is a 422
/// `profile.field_read_only` the client never triggers by construction).
public struct AlunoProfileUpdate: Sendable, Equatable {
    public var fullName: String?
    public var gender: ProfileFieldUpdate<Gender>
    public var phone: ProfileFieldUpdate<String>
    /// Write-once — sent only while unlocked.
    public var cpf: String?
    /// Write-once — sent only while unlocked.
    public var rg: String?
    public var addressLine: ProfileFieldUpdate<String>
    public var addressCity: ProfileFieldUpdate<String>
    public var addressState: ProfileFieldUpdate<String>
    public var addressZip: ProfileFieldUpdate<String>
    public var emergencyContactName: ProfileFieldUpdate<String>
    public var emergencyContactPhone: ProfileFieldUpdate<String>

    public init(
        fullName: String? = nil,
        gender: ProfileFieldUpdate<Gender> = .unchanged,
        phone: ProfileFieldUpdate<String> = .unchanged,
        cpf: String? = nil,
        rg: String? = nil,
        addressLine: ProfileFieldUpdate<String> = .unchanged,
        addressCity: ProfileFieldUpdate<String> = .unchanged,
        addressState: ProfileFieldUpdate<String> = .unchanged,
        addressZip: ProfileFieldUpdate<String> = .unchanged,
        emergencyContactName: ProfileFieldUpdate<String> = .unchanged,
        emergencyContactPhone: ProfileFieldUpdate<String> = .unchanged
    ) {
        self.fullName = fullName
        self.gender = gender
        self.phone = phone
        self.cpf = cpf
        self.rg = rg
        self.addressLine = addressLine
        self.addressCity = addressCity
        self.addressState = addressState
        self.addressZip = addressZip
        self.emergencyContactName = emergencyContactName
        self.emergencyContactPhone = emergencyContactPhone
    }
}

/// PT-BR display helpers for the Dados pessoais screen (aluno-18).
public enum ProfileFormatters {
    /// "12345678900" → "123.456.789-00" (renders raw when not 11 digits).
    public static func cpfMask(_ digits: String) -> String {
        guard digits.count == 11, digits.allSatisfy(\.isNumber) else { return digits }
        let d = Array(digits)
        return "\(String(d[0...2])).\(String(d[3...5])).\(String(d[6...8]))-\(String(d[9...10]))"
    }

    /// "01310100" → "01310-100" (renders raw when not 8 digits).
    public static func cepMask(_ digits: String) -> String {
        guard digits.count == 8, digits.allSatisfy(\.isNumber) else { return digits }
        return "\(digits.prefix(5))-\(digits.suffix(3))"
    }

    /// ISO "yyyy-MM-dd" → "14/03/1998" (renders raw on malformed input).
    public static func birthDateBR(_ iso: String) -> String {
        let parts = iso.split(separator: "-")
        guard parts.count == 3 else { return iso }
        return "\(parts[2])/\(parts[1])/\(parts[0])"
    }

    /// City + UF as the aluno-18 single input: "São Paulo / SP".
    public static func cityUF(city: String?, uf: String?) -> String {
        switch (city, uf) {
        case (.some(let city), .some(let uf)): "\(city) / \(uf)"
        case (.some(let city), nil): city
        case (nil, .some(let uf)): uf
        case (nil, nil): ""
        }
    }

    /// Parses the single "Cidade / UF" input back into the two typed
    /// columns (spec 013: parsed on save; UF validated server-side).
    public static func parseCityUF(_ raw: String) -> (city: String?, uf: String?) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return (nil, nil) }
        guard let slash = trimmed.lastIndex(of: "/") else { return (trimmed, nil) }
        let city = String(trimmed[..<slash]).trimmingCharacters(in: .whitespacesAndNewlines)
        let uf = String(trimmed[trimmed.index(after: slash)...])
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        return (city.isEmpty ? nil : city, uf.isEmpty ? nil : uf)
    }
}
