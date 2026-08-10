// Month calendar screen shared by aluno and professor (handoff aluno-08 /
// professor-04, spec 007 AGD.10): back chevron + "Agosto 2026" header with
// the persona subtitle, the Sunday-first month grid with recurrence dots,
// the dot legend, and the selected-day agenda with the persona's designed
// empty copy. Current month only — the chevron is back navigation, not
// month paging. PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct MonthCalendarView: View {
    @State private var model: MonthCalendarModel
    private let onOpenEvent: ((EventListItem) -> Void)?

    public init(
        persona: CalendarPersona,
        repository: any AgendaRepository,
        onOpenEvent: ((EventListItem) -> Void)? = nil
    ) {
        _model = State(initialValue: MonthCalendarModel(persona: persona, repository: repository))
        self.onOpenEvent = onOpenEvent
    }

    public var body: some View {
        MonthCalendarContent(model: model, onOpenEvent: onOpenEvent)
    }
}

struct MonthCalendarContent: View {
    @Bindable var model: MonthCalendarModel
    var onOpenEvent: ((EventListItem) -> Void)?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                header

                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    AgendaErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded:
                    calendarCard
                    dayAgenda
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .task { await model.load() }
        .agendaNavigationBarHiddenOnIOS()
    }

    // MARK: Header (back chevron = navigation, never month paging)

    private var header: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(LumiraTokens.Colors.fg2)
                    .frame(width: 38, height: 38)
                    .background(LumiraTokens.Colors.bgSurface)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1))
            }
            .accessibilityIdentifier("calendar-back-button")
            VStack(alignment: .leading, spacing: 2) {
                Text(model.grid.titlePTBR)
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text(model.persona.subtitlePTBR)
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
            }
            Spacer()
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    // MARK: Month grid card (stories 14-16)

    private var calendarCard: some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            weekdayHeader
            dayGrid
            legend
        }
        .padding(LumiraTokens.Space.s4)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }

    private var gridColumns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 2), count: 7)
    }

    private var weekdayHeader: some View {
        LazyVGrid(columns: gridColumns, spacing: 2) {
            ForEach(Array(MonthGrid.weekdayLettersPTBR.enumerated()), id: \.offset) { _, letter in
                Text(letter)
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
        }
    }

    private var dayGrid: some View {
        LazyVGrid(columns: gridColumns, spacing: 2) {
            ForEach(0..<model.grid.leadingBlanks, id: \.self) { _ in
                Color.clear
                    .frame(height: 44)
            }
            ForEach(1...model.grid.daysInMonth, id: \.self) { day in
                dayCell(day)
            }
        }
    }

    private func dayCell(_ day: Int) -> some View {
        let selected = model.selectedDay == day
        let isToday = model.grid.todayDay == day
        return Button {
            model.selectedDay = day
        } label: {
            VStack(spacing: 2) {
                Text("\(day)")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(selected ? LumiraTokens.Colors.fgOnColor : LumiraTokens.Colors.fg1)
                HStack(spacing: 2) {
                    if model.hasClassDot(day: day) {
                        Circle()
                            .fill(selected ? LumiraTokens.Colors.fgOnColor : LumiraTokens.Colors.purple500)
                            .frame(width: 4, height: 4)
                    }
                    if model.hasEventDot(day: day) {
                        Circle()
                            .fill(LumiraTokens.Colors.pink500)
                            .frame(width: 4, height: 4)
                    }
                }
                .frame(height: 4)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(cellBackground(selected: selected, isToday: isToday))
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("calendar-day-\(day)")
    }

    private func cellBackground(selected: Bool, isToday: Bool) -> Color {
        if selected { return LumiraTokens.Colors.purple700 }
        if isToday { return LumiraTokens.Colors.purple100 }
        return Color.clear
    }

    // MARK: Legend (story 15)

    private var legend: some View {
        HStack(spacing: LumiraTokens.Space.s4) {
            legendEntry(color: LumiraTokens.Colors.purple500, label: model.persona.classLegendPTBR)
            legendEntry(color: LumiraTokens.Colors.pink500, label: "evento")
            Spacer()
        }
        .padding(.top, LumiraTokens.Space.s2)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(LumiraTokens.Colors.border1)
                .frame(height: 1)
        }
    }

    private func legendEntry(color: Color, label: String) -> some View {
        HStack(spacing: LumiraTokens.Space.s1) {
            Circle()
                .fill(color)
                .frame(width: 5, height: 5)
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
        }
    }

    // MARK: Selected-day agenda (stories 17-18, 22-23)

    private var dayAgenda: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            Text(model.selectedDayHeadingPTBR)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
                .accessibilityIdentifier("calendar-day-heading")

            if model.showsEmptyDay {
                Text(model.persona.emptyDayPTBR)
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, LumiraTokens.Space.s6)
                    .accessibilityIdentifier("calendar-empty-day")
            } else {
                ForEach(model.selectedDayItems) { item in
                    dayItemRow(item)
                }
                // Evento entries merge into the selected-day agenda
                // (spec 008 story 16).
                ForEach(model.selectedDayEvents) { event in
                    dayEventRow(event)
                }
            }
        }
        .padding(.top, LumiraTokens.Space.s2)
    }

    private func dayItemRow(_ item: CalendarClassItem) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            Text(item.startTime)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.inkPurple)
                .frame(width: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.className)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text(subtitle(for: item))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
            }
            Spacer()
            Text("Aula")
                .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.purple800)
                .padding(.horizontal, LumiraTokens.Space.s2)
                .padding(.vertical, LumiraTokens.Space.s1)
                .background(LumiraTokens.Colors.purple100)
                .clipShape(Capsule())
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }

    /// One Evento entry (spec 008 story 16): time, name, location line and
    /// the pink Evento tag; aluno rows open the detail when wired.
    private func dayEventRow(_ event: EventListItem) -> some View {
        let row = HStack(spacing: LumiraTokens.Space.s3) {
            Text(event.time ?? "—")
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.inkPink)
                .frame(width: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.name)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text(event.location ?? EventFormatters.valorChipPTBR(priceCents: event.priceCents))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
            }
            Spacer()
            Text("Evento")
                .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.pink700)
                .padding(.horizontal, LumiraTokens.Space.s2)
                .padding(.vertical, LumiraTokens.Space.s1)
                .background(LumiraTokens.Colors.pink100)
                .clipShape(Capsule())
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier("calendar-event-\(event.id.uuidString.lowercased())")

        return Group {
            if let onOpenEvent {
                Button {
                    onOpenEvent(event)
                } label: {
                    row
                }
                .buttonStyle(.plain)
            } else {
                row
            }
        }
    }

    /// Aluno rows carry the professor; professor rows carry the occupancy
    /// (spec stories 17/22).
    private func subtitle(for item: CalendarClassItem) -> String {
        switch model.persona {
        case .aluno: item.professorName
        case .professor: item.occupancy.labelPTBR
        }
    }

    private var loadingState: some View {
        RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
            .fill(LumiraTokens.Colors.bgSunken)
            .frame(height: 340)
            .redacted(reason: .placeholder)
    }
}
