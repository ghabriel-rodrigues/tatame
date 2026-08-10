// Aluno Agenda tab (handoff aluno-11, spec 007 AGD.9): header with the
// academy name and the "Mês" button, seven day pills (today preselected),
// the selected weekday's class cards with the check-in affordance, the
// "Sem aulas neste dia" empty state, and the "Eventos do mês" section —
// real month events since spec 008 (the Phase-7 empty state retires).
// PT-BR copy; Lumira tokens only.

import AttendanceFeature
import DesignSystem
import SwiftUI
import TatameCore

public struct AlunoAgendaView: View {
    @State private var model: AlunoAgendaModel
    private let repository: any AgendaRepository
    private let academyName: String?
    private let onOpenEvent: ((EventListItem) -> Void)?

    public init(
        repository: any AgendaRepository,
        academyName: String?,
        onOpenEvent: ((EventListItem) -> Void)? = nil
    ) {
        _model = State(initialValue: AlunoAgendaModel(repository: repository))
        self.repository = repository
        self.academyName = academyName
        self.onOpenEvent = onOpenEvent
    }

    public var body: some View {
        AlunoAgendaContent(
            model: model,
            repository: repository,
            academyName: academyName,
            onOpenEvent: onOpenEvent
        )
    }
}

struct AlunoAgendaContent: View {
    @Bindable var model: AlunoAgendaModel
    let repository: any AgendaRepository
    let academyName: String?
    var onOpenEvent: ((EventListItem) -> Void)?

    @State private var showMonthCalendar = false
    @Environment(\.attendanceRepository) private var attendanceRepository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                header
                dayPills

                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    AgendaErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded(let agenda):
                    if agenda.classes.isEmpty {
                        emptyDayState
                    } else {
                        ForEach(agenda.classes) { item in
                            classCard(item, agenda: agenda)
                        }
                    }
                    eventosSection(agenda.events)
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(
            isPresented: Binding(
                get: { model.checkinTarget != nil },
                set: { presented in
                    if !presented { model.checkinTarget = nil }
                }
            )
        ) {
            if let target = model.checkinTarget {
                CheckinSheet(
                    model: CheckinModel(
                        todayClass: target,
                        repository: attendanceRepository,
                        onResult: { model.handleCheckinResult($0) }
                    )
                )
                .presentationDetents([.medium, .large])
            }
        }
        .navigationDestination(isPresented: $showMonthCalendar) {
            MonthCalendarView(persona: .aluno, repository: repository, onOpenEvent: onOpenEvent)
        }
    }

    // MARK: Header (story 13)

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Agenda")
                    .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                if let academyName {
                    Text("Horários da \(academyName)")
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg3)
                }
            }
            Spacer()
            Button {
                showMonthCalendar = true
            } label: {
                HStack(spacing: LumiraTokens.Space.s2) {
                    Image(systemName: "calendar")
                        .font(.system(size: LumiraTokens.FontSize.textSm))
                    Text("Mês")
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                }
                .foregroundStyle(LumiraTokens.Colors.fg2)
                .padding(.horizontal, LumiraTokens.Space.s4)
                .frame(height: 38)
                .background(LumiraTokens.Colors.bgSurface)
                .clipShape(Capsule())
                .overlay(Capsule().strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1))
            }
            .accessibilityIdentifier("agenda-mes-button")
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    // MARK: Day pills (stories 1-2)

    private var dayPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LumiraTokens.Space.s2) {
                ForEach(0..<7, id: \.self) { weekday in
                    let selected = model.selectedWeekday == weekday
                    Button {
                        Task { await model.select(weekday: weekday) }
                    } label: {
                        Text(WeekdayLabels.short(weekday))
                            .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                            .foregroundStyle(selected ? LumiraTokens.Colors.fgOnColor : LumiraTokens.Colors.fg2)
                            .frame(width: 44, height: 40)
                            .background(selected ? LumiraTokens.Colors.purple700 : LumiraTokens.Colors.bgSurface)
                            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                                    .strokeBorder(
                                        selected ? Color.clear : LumiraTokens.Colors.border1,
                                        lineWidth: 1
                                    )
                            )
                    }
                    .accessibilityIdentifier("day-pill-\(weekday)")
                }
            }
        }
    }

    // MARK: Class card (stories 3-10)

    private func classCard(_ item: AgendaClassItem, agenda: AlunoAgenda) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            VStack(spacing: 2) {
                Text(item.startTime)
                    .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
                Text(item.endTime)
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
            .frame(width: 54)

            Rectangle()
                .fill(LumiraTokens.Colors.border1)
                .frame(width: 1)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.className)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text(item.professorName)
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                HStack(spacing: LumiraTokens.Space.s2) {
                    chip(item.levelChipLabelPTBR, brand: true)
                    chip(item.occupancy.labelPTBR, brand: false)
                }
                .padding(.top, LumiraTokens.Space.s2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if agenda.showsCheckinButton(for: item) {
                Button {
                    model.openCheckin(for: item)
                } label: {
                    Text("Check-in")
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                        .padding(.horizontal, LumiraTokens.Space.s3)
                        .frame(height: 36)
                        .background(LumiraTokens.Colors.purple700)
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("agenda-checkin-\(item.classId.uuidString.lowercased())")
            } else if item.checkedIn {
                Image(systemName: "checkmark")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .bold))
                    .foregroundStyle(LumiraTokens.Colors.success500)
                    .frame(width: 32, height: 32)
                    .background(LumiraTokens.Colors.success100)
                    .clipShape(Circle())
                    .accessibilityIdentifier("agenda-checked-in-\(item.classId.uuidString.lowercased())")
            }
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }

    private func chip(_ text: String, brand: Bool) -> some View {
        Text(text)
            .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
            .foregroundStyle(brand ? LumiraTokens.Colors.purple800 : LumiraTokens.Colors.fg3)
            .padding(.horizontal, LumiraTokens.Space.s2)
            .padding(.vertical, LumiraTokens.Space.s1)
            .background(brand ? LumiraTokens.Colors.purple100 : LumiraTokens.Colors.bgSunken)
            .clipShape(Capsule())
    }

    // MARK: Empty day (story 11)

    private var emptyDayState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Image(systemName: "clock")
                .font(.system(size: LumiraTokens.FontSize.textLg))
                .foregroundStyle(LumiraTokens.Colors.purple400)
                .frame(width: 56, height: 56)
                .background(LumiraTokens.Colors.purple50)
                .clipShape(Circle())
            Text("Sem aulas neste dia")
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg2)
            Text("Bom descanso — o tatame espera você amanhã.")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s8)
        .accessibilityIdentifier("agenda-empty-day")
    }

    // MARK: Eventos do mês (spec 008, story 10 — the Phase-7 empty state
    // retires; the empty copy stays for genuinely event-less months)

    private func eventosSection(_ events: [EventListItem]) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            Text("Eventos do mês")
                .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            if events.isEmpty {
                Text("Nenhum evento neste mês")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, LumiraTokens.Space.s5)
                    .background(LumiraTokens.Colors.bgSurface)
                    .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                            .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
                    )
                    .accessibilityIdentifier("eventos-empty")
            } else {
                ForEach(events) { item in
                    EventRowCard(item: item, onTap: onOpenEvent.map { open in { open(item) } })
                        .accessibilityIdentifier("agenda-event-\(item.id.uuidString.lowercased())")
                }
            }
        }
        .padding(.top, LumiraTokens.Space.s4)
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            ForEach(0..<2, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                    .fill(LumiraTokens.Colors.bgSunken)
                    .frame(height: 96)
            }
        }
        .redacted(reason: .placeholder)
    }
}
