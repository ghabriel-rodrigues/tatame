// Generated `Components.Schemas.*` → TatameCore agenda models (spec 007;
// same convention as AttendanceMapping: features never see generated types).

import Foundation
import TatameCore

private func uuid(_ raw: String, _ what: String) throws -> UUID {
    guard let id = UUID(uuidString: raw) else {
        throw ApiError.decoding(description: "invalid \(what): \(raw)")
    }
    return id
}

extension AgendaOccupancy {
    init(dto: Components.Schemas.AgendaOccupancyDto) {
        self.init(active: Int(dto.active), capacity: Int(dto.capacity))
    }
}

extension AgendaClassItem {
    init(dto: Components.Schemas.AlunoAgendaClassDto) throws {
        self.init(
            classId: try uuid(dto.classId, "class id"),
            className: dto.className,
            startTime: dto.startTime,
            endTime: dto.endTime,
            professorName: dto.professorName,
            ageMin: dto.ageMin.map(Int.init),
            ageMax: dto.ageMax.map(Int.init),
            minBelt: try dto.minBelt.map { try BeltRef(dto: $0.value1) },
            maxBelt: try dto.maxBelt.map { try BeltRef(dto: $0.value1) },
            occupancy: AgendaOccupancy(dto: dto.occupancy),
            checkedIn: dto.checkedIn
        )
    }
}

extension AlunoAgenda {
    init(dto: Components.Schemas.AlunoAgendaResponseDto) throws {
        self.init(
            weekday: Int(dto.weekday),
            isToday: dto.isToday,
            classes: try dto.classes.map(AgendaClassItem.init(dto:)),
            // Real "Eventos do mês" items with own state (spec 008 — the
            // Phase-7 placeholder retires).
            events: try dto.events.map(EventListItem.init(dto:))
        )
    }
}

extension CalendarClassItem {
    init(dto: Components.Schemas.CalendarClassItemDto) throws {
        self.init(
            classId: try uuid(dto.classId, "class id"),
            className: dto.className,
            startTime: dto.startTime,
            endTime: dto.endTime,
            professorName: dto.professorName,
            occupancy: AgendaOccupancy(dto: dto.occupancy)
        )
    }
}

extension PersonaCalendar {
    init(dto: Components.Schemas.CalendarResponseDto) throws {
        let buckets = dto.classesByWeekday
        self.init(
            month: dto.month,
            classesByWeekday: [
                0: try buckets._0.map(CalendarClassItem.init(dto:)),
                1: try buckets._1.map(CalendarClassItem.init(dto:)),
                2: try buckets._2.map(CalendarClassItem.init(dto:)),
                3: try buckets._3.map(CalendarClassItem.init(dto:)),
                4: try buckets._4.map(CalendarClassItem.init(dto:)),
                5: try buckets._5.map(CalendarClassItem.init(dto:)),
                6: try buckets._6.map(CalendarClassItem.init(dto:)),
            ],
            // Dated month events — the pink dots (spec 008).
            events: try dto.events.map(EventListItem.init(dto:))
        )
    }
}
