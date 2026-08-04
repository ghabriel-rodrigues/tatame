// Professor chamada ao vivo (handoff professor-03): big 4-digit code, real
// QR (CoreImage over the opaque qr_token), expiry countdown, live counter +
// arriving list over SSE with the polling fallback, Encerrar + Reabrir.
// PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct LiveChamadaSheet: View {
    @State private var model: LiveChamadaModel

    public init(classId: UUID, repository: any AttendanceRepository) {
        _model = State(initialValue: LiveChamadaModel(classId: classId, repository: repository))
    }

    public var body: some View {
        LiveChamadaContent(model: model)
    }
}

struct LiveChamadaContent: View {
    @Bindable var model: LiveChamadaModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                switch model.phase {
                case .idle, .opening:
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LumiraTokens.Space.s12)
                case .failed(let message):
                    AttendanceErrorBanner(message: message) {
                        Task { await model.start() }
                    }
                    .padding(.top, LumiraTokens.Space.s6)
                case .open(let code):
                    header(code, closed: false)
                    codeSection(code)
                    counterSection
                    if let actionError = model.actionError {
                        AttendanceActionErrorBanner(message: actionError, identifier: "chamada-action-error")
                    }
                    encerrarButton
                case .closed(let code):
                    header(code, closed: true)
                    closedCard(code)
                    if let actionError = model.actionError {
                        AttendanceActionErrorBanner(message: actionError, identifier: "chamada-action-error")
                    }
                    reopenButton
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .task { await model.start() }
        .onDisappear { model.stop() }
    }

    // MARK: Header

    private func header(_ code: LiveCode, closed: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(closed ? "Chamada encerrada" : "Chamada aberta") · \(code.session.className)")
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(
                closed
                    ? "O código e o QR foram invalidados."
                    : "Os alunos podem entrar com o código ou lendo o QR."
            )
            .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg4)
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    // MARK: Code + QR (stories 20, 25)

    private func codeSection(_ code: LiveCode) -> some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            CodeDigitBoxes(digits: code.code, boxSize: 56)
                .accessibilityIdentifier("live-code-digits")

            TimelineView(.periodic(from: .now, by: 1)) { context in
                let expired = !code.isActive(at: context.date)
                Text(
                    expired
                        ? "Código expirado — reabra a chamada para gerar outro"
                        : "Expira em \(AttendanceFormatters.countdown(until: code.expiresAt, from: context.date)) · sem presenças duplicadas"
                )
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(expired ? LumiraTokens.Colors.danger500 : LumiraTokens.Colors.fg4)
            }

            QRCodeView(content: code.qrToken)
                .frame(width: 148, height: 148)
                .padding(LumiraTokens.Space.s3)
                .background(LumiraTokens.Colors.white)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
                )
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Live counter + arriving list (stories 21-22)

    private var counterSection: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            HStack(spacing: LumiraTokens.Space.s2) {
                Circle()
                    .fill(LumiraTokens.Colors.success500)
                    .frame(width: 8, height: 8)
                Text(AttendanceFormatters.liveCounterLabelPTBR(model.presentCount))
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.success500)
                    .accessibilityIdentifier("live-counter")
                Spacer()
                if model.connection == .polling {
                    Text("atualizando a cada 5 s")
                        .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                        .accessibilityIdentifier("polling-indicator")
                }
            }

            if !model.attendees.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(model.attendees.enumerated()), id: \.element.id) { index, attendee in
                        HStack(spacing: LumiraTokens.Space.s3) {
                            AttendanceAvatar(initials: NameInitials.from(attendee.studentName), size: 30)
                            Text(attendee.studentName)
                                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                                .foregroundStyle(LumiraTokens.Colors.fg1)
                            Spacer()
                            if let marker = attendee.method.markerLabelPTBR {
                                AttendanceChip(text: marker, style: .neutral)
                            }
                        }
                        .padding(.horizontal, LumiraTokens.Space.s4)
                        .padding(.vertical, LumiraTokens.Space.s2)
                        if index < model.attendees.count - 1 {
                            Divider().overlay(LumiraTokens.Colors.border1)
                        }
                    }
                }
                .background(LumiraTokens.Colors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
                )
            }
        }
    }

    // MARK: Encerrar / Reabrir (stories 23-24)

    private var encerrarButton: some View {
        Button {
            Task { await model.encerrar() }
        } label: {
            Text("Encerrar chamada")
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(LumiraTokens.Colors.inkPurple)
                .clipShape(Capsule())
        }
        .accessibilityIdentifier("encerrar-chamada")
    }

    private var reopenButton: some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            Button {
                Task { await model.reopen() }
            } label: {
                Text("Reabrir chamada")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(LumiraTokens.Colors.purple100)
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier("reabrir-chamada")
            Button {
                dismiss()
            } label: {
                Text("Fechar")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
        }
    }

    private func closedCard(_ code: LiveCode) -> some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: "checkmark.seal")
                .font(.system(size: LumiraTokens.FontSize.text2xl))
                .foregroundStyle(LumiraTokens.Colors.success500)
            Text(AttendanceFormatters.liveCounterLabelPTBR(model.presentCount))
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s8)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }
}
