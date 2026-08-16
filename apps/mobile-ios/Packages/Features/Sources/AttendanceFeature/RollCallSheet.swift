// Professor chamada manual (handoff professor-10, ACTIVE behavior — the
// screenshot's all-disabled state is a recorded capture bug): roster with
// immediate per-tap toggles, "N presentes de M" header, manual markers,
// "Salvar chamada" as pure navigation. PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct RollCallSheet: View {
    @State private var model: RollCallModel

    public init(classId: UUID, repository: any AttendanceRepository, professorUserId: UUID? = nil) {
        _model = State(
            initialValue: RollCallModel(
                classId: classId,
                repository: repository,
                professorUserId: professorUserId
            )
        )
    }

    public var body: some View {
        RollCallContent(model: model)
    }
}

struct RollCallContent: View {
    @Bindable var model: RollCallModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                    header

                    switch model.phase {
                    case .idle, .loading:
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, LumiraTokens.Space.s12)
                    case .failed(let message):
                        AttendanceErrorBanner(message: message) {
                            Task { await model.load() }
                        }
                    case .loaded:
                        if let actionError = model.actionError {
                            AttendanceActionErrorBanner(message: actionError, identifier: "roll-call-error")
                        }
                        rosterList
                    }
                }
                .padding(.horizontal, LumiraTokens.Space.s6)
                .padding(.bottom, LumiraTokens.Space.s4)
            }

            saveButton
        }
        .background(ThemedColors.bgApp)
        .task { await model.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Chamada · \(model.session?.className ?? "")")
                .font(.quicksand(size: LumiraTokens.FontSize.textLg, weight: .bold))
                .foregroundStyle(ThemedColors.fg1)
            if case .loaded = model.phase {
                Text(model.headerCountPTBR)
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                    .foregroundStyle(ThemedColors.fg4)
                    .accessibilityIdentifier("roll-call-count")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, LumiraTokens.Space.s6)
    }

    private var rosterList: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            ForEach(model.rows) { row in
                RollCallRowView(
                    row: row,
                    busy: model.busyStudentIds.contains(row.studentId)
                ) {
                    Task { await model.toggle(row) }
                }
            }
        }
    }

    /// Toggles are applied as tapped — saving is pure navigation (story 32).
    private var saveButton: some View {
        Button {
            dismiss()
        } label: {
            Text("Salvar chamada")
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.fgOnColor)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(ThemedColors.inkPurple)
                .clipShape(Capsule())
        }
        .padding(.horizontal, LumiraTokens.Space.s6)
        .padding(.vertical, LumiraTokens.Space.s3)
        .accessibilityIdentifier("salvar-chamada")
    }
}

/// One roster row: avatar, name, manual marker, presence toggle.
struct RollCallRowView: View {
    let row: RollCallRow
    let busy: Bool
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            AttendanceAvatar(initials: NameInitials.from(row.fullName))
            VStack(alignment: .leading, spacing: 2) {
                Text(row.fullName)
                    .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg1)
                // Derived belt (spec 005 — the Phase-4 chip deferral).
                if let belt = row.belt {
                    BeltBar(
                        colorSlug: belt.colorSlug,
                        tipColorSlug: belt.tipColorSlug,
                        degrees: belt.degrees,
                        maxDegrees: belt.maxDegrees,
                        size: .sm
                    )
                    .frame(width: 44)
                }
            }
            Spacer()
            if let marker = row.attendance?.method.markerLabelPTBR {
                AttendanceChip(text: marker, style: .brand)
            }
            Button(action: onToggle) {
                ZStack {
                    Circle()
                        .fill(row.present ? ThemedColors.success500 : ThemedColors.bgSunken)
                        .frame(width: 28, height: 28)
                    if row.present {
                        Image(systemName: "checkmark")
                            .font(.system(size: LumiraTokens.FontSize.textXs, weight: .bold))
                            .foregroundStyle(ThemedColors.fgOnColor)
                    } else {
                        Circle()
                            .strokeBorder(ThemedColors.border2, lineWidth: 1)
                            .frame(width: 28, height: 28)
                    }
                }
            }
            .disabled(busy)
            .opacity(busy ? 0.5 : 1)
            .accessibilityIdentifier("roll-call-toggle-\(row.studentId.uuidString.lowercased())")
        }
        .padding(.horizontal, LumiraTokens.Space.s4)
        .padding(.vertical, LumiraTokens.Space.s3)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
    }
}
