// Generated `Components.Schemas.*` → TatameCore events models (spec 008;
// same convention as BillingMapping: features never see generated types).

import Foundation
import TatameCore

private func uuid(_ raw: String, _ what: String) throws -> UUID {
    guard let id = UUID(uuidString: raw) else {
        throw ApiError.decoding(description: "invalid \(what): \(raw)")
    }
    return id
}

extension EventRegistrationState {
    init(dto: Components.Schemas.EventRegistrationStateDto) throws {
        self.init(
            id: try uuid(dto.id, "registration id"),
            status: EventRegistrationStatus(rawValue: dto.status.rawValue) ?? .canceled,
            chargeId: try dto.chargeId.map { try uuid($0, "charge id") }
        )
    }
}

extension EventListItem {
    /// Aluno list shape (home "Próximos eventos" + agenda "Eventos do mês").
    init(dto: Components.Schemas.AlunoEventItemDto) throws {
        self.init(
            id: try uuid(dto.id, "event id"),
            name: dto.name,
            bannerPreset: dto.bannerPreset,
            location: dto.location,
            date: dto.date,
            time: dto.time,
            priceCents: dto.priceCents.map(Int.init),
            registration: try dto.registration.map { try EventRegistrationState(dto: $0.value1) }
        )
    }

    /// Calendar shape — same fields; registration present on aluno only.
    init(dto: Components.Schemas.CalendarEventItemDto) throws {
        self.init(
            id: try uuid(dto.id, "event id"),
            name: dto.name,
            bannerPreset: dto.bannerPreset,
            location: dto.location,
            date: dto.date,
            time: dto.time,
            priceCents: dto.priceCents.map(Int.init),
            registration: try dto.registration.map { try EventRegistrationState(dto: $0.value1) }
        )
    }
}

extension EventDetail {
    init(dto: Components.Schemas.AlunoEventDetailResponseDto) throws {
        self.init(
            id: try uuid(dto.id, "event id"),
            name: dto.name,
            bannerPreset: dto.bannerPreset,
            location: dto.location,
            date: dto.date,
            time: dto.time,
            priceCents: dto.priceCents.map(Int.init),
            description: dto.description,
            responsibleName: dto.responsible.value1.fullName,
            registration: try dto.registration.map { try EventRegistrationState(dto: $0.value1) }
        )
    }
}

extension EventRegistrationOutcome {
    init(dto: Components.Schemas.RegisterEventResponseDto) throws {
        self.init(
            registration: try EventRegistrationState(dto: dto.registration),
            chargeId: try dto.chargeId.map { try uuid($0, "charge id") }
        )
    }
}

extension GuardianEventDependent {
    init(dto: Components.Schemas.ResponsavelEventDependentDto) throws {
        self.init(
            studentId: try uuid(dto.studentId, "student id"),
            fullName: dto.fullName,
            registration: try dto.registration.map { try EventRegistrationState(dto: $0.value1) }
        )
    }
}

extension GuardianEvent {
    init(dto: Components.Schemas.ResponsavelEventDto) throws {
        self.init(
            id: try uuid(dto.id, "event id"),
            name: dto.name,
            bannerPreset: dto.bannerPreset,
            location: dto.location,
            date: dto.date,
            time: dto.time,
            priceCents: dto.priceCents.map(Int.init),
            description: dto.description,
            dependents: try dto.dependents.map(GuardianEventDependent.init(dto:))
        )
    }
}

extension ProfessorUpcomingEvent {
    init(dto: Components.Schemas.ProfessorUpcomingEventDto) throws {
        self.init(
            id: try uuid(dto.id, "event id"),
            name: dto.name,
            bannerPreset: dto.bannerPreset,
            location: dto.location,
            date: dto.date,
            time: dto.time,
            priceCents: dto.priceCents.map(Int.init),
            confirmedCount: Int(dto.confirmedCount)
        )
    }
}
