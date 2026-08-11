// Shared event list cards (spec 008, EVT.14-15): the date-square row card
// used by the aluno home "Próximos eventos", the Agenda "Eventos do mês" and
// the professor dashboard "Eventos futuros" list. Lives here (the bottom
// feature layer) so AgendaFeature reuses it without new dependency edges.
// PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

/// "Gratuito" / "R$ 60,00" valor chip; flips to the green "Confirmado" check
/// chip when the caller's registration is confirmed (aluno-03 card states).
public struct EventValorChip: View {
    let priceCents: Int?
    let confirmed: Bool

    public init(priceCents: Int?, confirmed: Bool = false) {
        self.priceCents = priceCents
        self.confirmed = confirmed
    }

    public var body: some View {
        if confirmed {
            HStack(spacing: LumiraTokens.Space.s1) {
                Image(systemName: "checkmark")
                Text("Confirmado")
            }
            .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
            .foregroundStyle(ThemedColors.success500)
            .padding(.horizontal, LumiraTokens.Space.s2)
            .padding(.vertical, LumiraTokens.Space.s1)
            .background(ThemedColors.success100)
            .clipShape(Capsule())
            .accessibilityIdentifier("event-confirmado-chip")
        } else {
            Text(EventFormatters.valorChipPTBR(priceCents: priceCents))
                .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.inkPink)
                .padding(.horizontal, LumiraTokens.Space.s2)
                .padding(.vertical, LumiraTokens.Space.s1)
                .background(ThemedColors.pink100)
                .clipShape(Capsule())
                .accessibilityIdentifier("event-valor-chip")
        }
    }
}

/// "15" over "ago" date square (aluno-03/aluno-11 event cards).
public struct EventDaySquare: View {
    let date: String?

    public init(date: String?) {
        self.date = date
    }

    public var body: some View {
        VStack(spacing: 0) {
            if let square = EventFormatters.daySquare(date: date) {
                Text(square.day)
                    .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.inkPurple)
                Text(square.month)
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg4)
            } else {
                Image(systemName: "calendar")
                    .font(.system(size: LumiraTokens.FontSize.textSm))
                    .foregroundStyle(ThemedColors.inkPurple)
            }
        }
        .frame(width: 48, height: 48)
        .background(ThemedColors.purple50)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
    }
}

/// One event row card: date square, name + line, trailing chip. `line`
/// defaults to the abbreviated date · time; the professor dashboard passes
/// its "N confirmados · valor" line instead (professor-02).
public struct EventRowCard: View {
    let name: String
    let date: String?
    let line: String
    let priceCents: Int?
    let confirmed: Bool
    let onTap: (() -> Void)?

    public init(
        name: String,
        date: String?,
        line: String,
        priceCents: Int?,
        confirmed: Bool = false,
        onTap: (() -> Void)? = nil
    ) {
        self.name = name
        self.date = date
        self.line = line
        self.priceCents = priceCents
        self.confirmed = confirmed
        self.onTap = onTap
    }

    public var body: some View {
        if let onTap {
            Button(action: onTap) { card }
                .buttonStyle(.plain)
        } else {
            card
        }
    }

    private var card: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            EventDaySquare(date: date)
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                    .lineLimit(1)
                Text(line)
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fg3)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            EventValorChip(priceCents: priceCents, confirmed: confirmed)
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
    }
}

public extension EventRowCard {
    /// Aluno list card off an `EventListItem` (home + agenda surfaces).
    init(item: EventListItem, onTap: (() -> Void)? = nil) {
        self.init(
            name: item.name,
            date: item.date,
            line: EventFormatters.shortDateLinePTBR(date: item.date, time: item.time),
            priceCents: item.priceCents,
            confirmed: item.isConfirmed,
            onTap: onTap
        )
    }

    /// Professor dashboard list card (read-only, professor-02).
    init(event: ProfessorUpcomingEvent) {
        self.init(
            name: event.name,
            date: event.date,
            line: EventFormatters.professorEventLinePTBR(
                confirmedCount: event.confirmedCount,
                priceCents: event.priceCents
            ),
            priceCents: event.priceCents
        )
    }
}
