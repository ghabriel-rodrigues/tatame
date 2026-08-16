// Generated `Components.Schemas.*` → TatameCore profile models (spec 013,
// REP.16; same convention as GraduationMapping: features never see generated
// types). The PUT body is hand-encoded because the NestJS-emitted schema
// types nullable strings as bare objects — see LiveProfileRepository.

import Foundation
import TatameCore

extension AlunoProfile {
    init(dto: Components.Schemas.AlunoProfileResponseDto) {
        self.init(
            fullName: dto.fullName,
            email: dto.email,
            birthDate: dto.birthDate,
            phone: dto.phone,
            gender: dto.gender.flatMap { Gender(rawValue: $0.rawValue) },
            cpf: dto.cpf,
            cpfLocked: dto.cpfLocked,
            rg: dto.rg,
            rgLocked: dto.rgLocked,
            addressLine: dto.addressLine,
            addressCity: dto.addressCity,
            addressState: dto.addressState,
            addressZip: dto.addressZip,
            emergencyContactName: dto.emergencyContactName,
            emergencyContactPhone: dto.emergencyContactPhone,
            avatarUrl: dto.avatarUrl
        )
    }
}

/// JSON body for PUT /aluno/profile: omitted = unchanged, explicit null =
/// clear (the backend's partial-update contract). Encoded by hand because
/// the generated `UpdateAlunoProfileDto` types the nullable string fields
/// as `OpenAPIObjectContainer` (NestJS swagger emits `type: object` for
/// `string | null`) — unusable for carrying strings.
struct UpdateAlunoProfileBody: Encodable {
    let update: AlunoProfileUpdate

    private enum Key: String, CodingKey {
        case fullName
        case gender
        case phone
        case cpf
        case rg
        case addressLine
        case addressCity
        case addressState
        case addressZip
        case emergencyContactName
        case emergencyContactPhone
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        if let fullName = update.fullName {
            try container.encode(fullName, forKey: .fullName)
        }
        if let cpf = update.cpf {
            try container.encode(cpf, forKey: .cpf)
        }
        if let rg = update.rg {
            try container.encode(rg, forKey: .rg)
        }
        switch update.gender {
        case .unchanged: break
        case .set(let value): try container.encode(value.rawValue, forKey: .gender)
        case .clear: try container.encodeNil(forKey: .gender)
        }
        try encode(update.phone, forKey: .phone, into: &container)
        try encode(update.addressLine, forKey: .addressLine, into: &container)
        try encode(update.addressCity, forKey: .addressCity, into: &container)
        try encode(update.addressState, forKey: .addressState, into: &container)
        try encode(update.addressZip, forKey: .addressZip, into: &container)
        try encode(update.emergencyContactName, forKey: .emergencyContactName, into: &container)
        try encode(update.emergencyContactPhone, forKey: .emergencyContactPhone, into: &container)
    }

    private func encode(
        _ field: ProfileFieldUpdate<String>,
        forKey key: Key,
        into container: inout KeyedEncodingContainer<Key>
    ) throws {
        switch field {
        case .unchanged: break
        case .set(let value): try container.encode(value, forKey: key)
        case .clear: try container.encodeNil(forKey: key)
        }
    }
}
