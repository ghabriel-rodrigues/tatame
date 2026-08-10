// Aluno Início (handoff aluno-03): date line + greeting, the purple hero
// with "Fazer check-in" (flipping to the "Presença registrada" chip state
// after check-in), real stat tiles (presença no mês, aulas seguidas when the
// academy plays the streak game), the graduation card fed by the true lesson
// count, and explicit placeholders for the later slices. PT-BR copy; Lumira
// tokens only.

import DesignSystem
import NotificationsFeature
import SwiftUI
import TatameCore

public struct AlunoHomeView: View {
    @State private var model: AlunoHomeModel
    private let onOpenGraduation: (() -> Void)?
    private let onOpenCarteira: (() -> Void)?
    private let onOpenAgenda: (() -> Void)?
    private let onOpenEvent: ((EventListItem) -> Void)?
    private let onOpenStore: (() -> Void)?
    private let onOpenStoreProduct: ((StoreProductCard) -> Void)?
    private let hasUnreadNotifications: Bool
    private let onOpenNotifications: (() -> Void)?

    public init(
        repository: any AttendanceRepository,
        onOpenGraduation: (() -> Void)? = nil,
        onOpenCarteira: (() -> Void)? = nil,
        onOpenAgenda: (() -> Void)? = nil,
        onOpenEvent: ((EventListItem) -> Void)? = nil,
        onOpenStore: (() -> Void)? = nil,
        onOpenStoreProduct: ((StoreProductCard) -> Void)? = nil,
        hasUnreadNotifications: Bool = false,
        onOpenNotifications: (() -> Void)? = nil
    ) {
        _model = State(initialValue: AlunoHomeModel(repository: repository))
        self.onOpenGraduation = onOpenGraduation
        self.onOpenCarteira = onOpenCarteira
        self.onOpenAgenda = onOpenAgenda
        self.onOpenEvent = onOpenEvent
        self.onOpenStore = onOpenStore
        self.onOpenStoreProduct = onOpenStoreProduct
        self.hasUnreadNotifications = hasUnreadNotifications
        self.onOpenNotifications = onOpenNotifications
    }

    public var body: some View {
        AlunoHomeContent(
            model: model,
            onOpenGraduation: onOpenGraduation,
            onOpenCarteira: onOpenCarteira,
            onOpenAgenda: onOpenAgenda,
            onOpenEvent: onOpenEvent,
            onOpenStore: onOpenStore,
            onOpenStoreProduct: onOpenStoreProduct,
            hasUnreadNotifications: hasUnreadNotifications,
            onOpenNotifications: onOpenNotifications
        )
    }
}

struct AlunoHomeContent: View {
    @Bindable var model: AlunoHomeModel
    var onOpenGraduation: (() -> Void)?
    var onOpenCarteira: (() -> Void)?
    var onOpenAgenda: (() -> Void)?
    var onOpenEvent: ((EventListItem) -> Void)?
    var onOpenStore: (() -> Void)?
    var onOpenStoreProduct: ((StoreProductCard) -> Void)?
    var hasUnreadNotifications = false
    var onOpenNotifications: (() -> Void)?
    @Environment(\.tatameTheme) private var theme
    @Environment(\.attendanceRepository) private var repository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    AttendanceErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                    .padding(.top, LumiraTokens.Space.s6)
                case .loaded(let home):
                    header(home)
                    heroCard(home)
                    statTiles(home)
                    graduationCard(home)
                    upcomingEventsSection(home)
                    storeStripSection(home)
                    rankingPlaceholder
                    mensalidadeAlert(home)
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(isPresented: $model.showCheckinSheet) {
            if let todayClass = model.home?.todayClass {
                CheckinSheet(
                    model: CheckinModel(
                        todayClass: todayClass,
                        repository: repository,
                        onResult: { model.applyCheckin($0) }
                    )
                )
                .presentationDetents([.medium, .large])
            }
        }
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .fill(LumiraTokens.Colors.bgSunken)
                .frame(height: 148)
            HStack(spacing: LumiraTokens.Space.s3) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .fill(LumiraTokens.Colors.bgSunken)
                        .frame(height: 76)
                }
            }
        }
        .redacted(reason: .placeholder)
        .padding(.top, LumiraTokens.Space.s6)
    }

    // MARK: Header (aluno-03)

    private func header(_ home: AlunoHome) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(AttendanceFormatters.headerDatePTBR())
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
                Text("Olá, \(AttendanceFormatters.firstName(home.studentName))")
                    .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
            }
            Spacer()
            HStack(spacing: LumiraTokens.Space.s3) {
                // Home-header bell + unread dot (spec 010, stories 1, 8).
                if let onOpenNotifications {
                    NotificationsBellButton(
                        hasUnread: hasUnreadNotifications,
                        action: onOpenNotifications
                    )
                }
                AttendanceAvatar(initials: NameInitials.from(home.studentName))
            }
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    // MARK: Hero (stories 1, 10)

    @ViewBuilder
    private func heroCard(_ home: AlunoHome) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            if let todayClass = home.todayClass {
                heroChip(todayClass)
                Text(todayClass.className)
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                Text("\(AttendanceFormatters.todayRangePTBR(slot: todayClass.slot)) · \(todayClass.slot.durationMinutes) min")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor.opacity(0.75))

                HStack(spacing: LumiraTokens.Space.s3) {
                    if !todayClass.checkedIn {
                        Button {
                            model.showCheckinSheet = true
                        } label: {
                            HStack(spacing: LumiraTokens.Space.s2) {
                                Image(systemName: "qrcode.viewfinder")
                                Text("Fazer check-in")
                            }
                            .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                            .foregroundStyle(LumiraTokens.Colors.inkPurple)
                            .padding(.horizontal, LumiraTokens.Space.s4)
                            .frame(height: 38)
                            .background(LumiraTokens.Colors.white)
                            .clipShape(Capsule())
                        }
                        .accessibilityIdentifier("fazer-checkin-button")
                    }
                    // Real "Ver agenda" CTA switching to the Agenda tab
                    // (spec 007 closes the recorded attendance-slice debt).
                    Button("Ver agenda") {
                        onOpenAgenda?()
                    }
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                    .accessibilityIdentifier("ver-agenda-button")
                }
                .padding(.top, LumiraTokens.Space.s2)
            } else {
                Text("Sem aula hoje")
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                Text("Aproveite o descanso — seu próximo treino aparece aqui.")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor.opacity(0.75))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s5)
        .background(
            LinearGradient(
                colors: [
                    theme.color("purple-700") ?? LumiraTokens.Colors.purple700,
                    theme.color("purple-500") ?? LumiraTokens.Colors.purple500,
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous))
    }

    @ViewBuilder
    private func heroChip(_ todayClass: AlunoTodayClass) -> some View {
        if todayClass.checkedIn {
            HStack(spacing: LumiraTokens.Space.s1) {
                Image(systemName: "checkmark")
                Text("Presença registrada")
            }
            .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.success500)
            .padding(.horizontal, LumiraTokens.Space.s2)
            .padding(.vertical, LumiraTokens.Space.s1)
            .background(LumiraTokens.Colors.success100)
            .clipShape(Capsule())
            .accessibilityIdentifier("hero-checked-in-chip")
        } else {
            HStack(spacing: LumiraTokens.Space.s1) {
                Image(systemName: "clock")
                Text(AttendanceFormatters.todayChipPTBR(slot: todayClass.slot))
            }
            .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fgOnColor)
            .padding(.horizontal, LumiraTokens.Space.s2)
            .padding(.vertical, LumiraTokens.Space.s1)
            .background(LumiraTokens.Colors.white.opacity(0.18))
            .clipShape(Capsule())
        }
    }

    // MARK: Stat tiles (stories 13-16; graus na faixa real per spec 005)

    private func statTiles(_ home: AlunoHome) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            AlunoStatTile(
                value: AttendanceFormatters.percentLabel(home.stats.monthPresencePct),
                label: "presença no mês"
            )
            if let streak = home.stats.streak {
                AlunoStatTile(
                    value: "🔥 \(streak)",
                    label: "aulas seguidas",
                    accent: true
                )
            }
            if let graduation = home.graduation {
                AlunoStatTile(value: "\(graduation.belt.degrees)", label: "graus na faixa")
            } else {
                AlunoStatTile(value: "—", label: "graus na faixa")
            }
        }
    }

    // MARK: Graduation card (spec 005 story 6 — real belt + real target,
    // linking to the Graduação screen)

    @ViewBuilder
    private func graduationCard(_ home: AlunoHome) -> some View {
        if let graduation = home.graduation {
            Button {
                onOpenGraduation?()
            } label: {
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                    HStack {
                        Text("Sua graduação")
                            .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                            .foregroundStyle(LumiraTokens.Colors.fg1)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                            .foregroundStyle(LumiraTokens.Colors.fg4)
                    }
                    BeltBar(
                        colorSlug: graduation.belt.colorSlug,
                        tipColorSlug: graduation.belt.tipColorSlug,
                        degrees: graduation.belt.degrees,
                        maxDegrees: graduation.belt.maxDegrees,
                        size: .md
                    )
                    HStack {
                        Text(graduation.progress.label)
                            .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                            .foregroundStyle(LumiraTokens.Colors.fg3)
                        Spacer()
                        Text("\(graduation.progress.current) de \(graduation.progress.target) aulas")
                            .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                            .foregroundStyle(LumiraTokens.Colors.fg3)
                            .accessibilityIdentifier("graduation-lesson-count")
                    }
                    ProgressBar(fraction: graduation.progress.fraction)
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
            .buttonStyle(.plain)
            .accessibilityIdentifier("graduation-card")
        }
    }

    // MARK: Mensalidade alert (spec 006, BIL.22 — story 7: real charge data
    // deep-linking into the Carteira; hidden when nothing is open)

    @ViewBuilder
    private func mensalidadeAlert(_ home: AlunoHome) -> some View {
        if let alert = home.mensalidade {
            HStack(spacing: LumiraTokens.Space.s3) {
                ZStack {
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                        .fill(LumiraTokens.Colors.warning500)
                        .frame(width: 38, height: 38)
                    Image(systemName: "creditcard")
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                        .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(BillingFormatters.alertTitlePTBR(alert: alert))
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg1)
                    Text(BillingFormatters.alertLinePTBR(alert: alert))
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg3)
                }
                Spacer()
                Button {
                    onOpenCarteira?()
                } label: {
                    Text("Pagar")
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                        .padding(.horizontal, LumiraTokens.Space.s4)
                        .frame(height: 36)
                        .background(LumiraTokens.Colors.purple700)
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("mensalidade-alert-pagar")
            }
            .padding(LumiraTokens.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LumiraTokens.Colors.warning100)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .accessibilityIdentifier("mensalidade-alert")
        }
    }

    // MARK: Próximos eventos (spec 008, EVT.14 — the next-2 window with
    // date-square cards, valor chip or Confirmado state; hidden when empty)

    @ViewBuilder
    private func upcomingEventsSection(_ home: AlunoHome) -> some View {
        if !home.upcomingEvents.isEmpty {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                Text("Próximos eventos")
                    .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                ForEach(home.upcomingEvents) { item in
                    EventRowCard(item: item, onTap: onOpenEvent.map { open in { open(item) } })
                        .accessibilityIdentifier("home-event-\(item.id.uuidString.lowercased())")
                }
            }
            .accessibilityIdentifier("proximos-eventos")
        }
    }

    // MARK: Loja da academia strip (spec 009, STO.14 — story 15: the first
    // active products from the home payload + "Ver tudo" into the vitrine;
    // hidden when the store has nothing to show)

    @ViewBuilder
    private func storeStripSection(_ home: AlunoHome) -> some View {
        if !home.storeStrip.isEmpty {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                HStack {
                    Text("Loja da academia")
                        .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg1)
                    Spacer()
                    Button("Ver tudo") {
                        onOpenStore?()
                    }
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
                    .accessibilityIdentifier("loja-ver-tudo")
                }
                HStack(alignment: .top, spacing: LumiraTokens.Space.s3) {
                    ForEach(home.storeStrip) { product in
                        StoreStripCard(product: product) {
                            onOpenStoreProduct?(product)
                        }
                    }
                }
            }
            .accessibilityIdentifier("store-strip")
        }
    }

    private var rankingPlaceholder: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            Image(systemName: "chart.bar.fill")
                .foregroundStyle(LumiraTokens.Colors.inkPink)
                .frame(width: 36, height: 36)
                .background(LumiraTokens.Colors.pink100)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("Ranking do mês")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text("Chega com os relatórios de presença")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
            Spacer()
        }
        .padding(LumiraTokens.Space.s4)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
        .opacity(0.7)
    }
}

/// One card of the home "Loja da academia" strip (spec 009): the monogram
/// gradient tile + name + price, pushing the product detail.
struct StoreStripCard: View {
    let product: StoreProductCard
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                StoreMonogramTile(
                    monogram: product.monogram,
                    gradientPreset: product.gradientPreset,
                    monogramSize: LumiraTokens.FontSize.textMd
                )
                .frame(height: 72)
                .frame(maxWidth: .infinity)
                Text(product.name)
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(BillingFormatters.amountBRL(product.priceCents))
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
            }
            .padding(LumiraTokens.Space.s2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LumiraTokens.Colors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-store-\(product.id.uuidString.lowercased())")
    }
}

/// Aluno home stat tile (handoff aluno-03; the streak one gets the pink
/// accent treatment).
struct AlunoStatTile: View {
    let value: String
    let label: String
    var footnote: String?
    var accent = false

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                .foregroundStyle(accent ? LumiraTokens.Colors.inkPink : LumiraTokens.Colors.fg1)
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
                .multilineTextAlignment(.center)
            if let footnote {
                Text(footnote)
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s3)
        .background(accent ? LumiraTokens.Colors.pink50 : LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(accent ? LumiraTokens.Colors.pink200 : LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }
}

/// Thin progress bar (graduation card).
struct ProgressBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(LumiraTokens.Colors.bgSunken)
                Capsule()
                    .fill(LumiraTokens.Colors.brandAccent)
                    .frame(width: max(0, proxy.size.width * fraction))
            }
        }
        .frame(height: 5)
    }
}
