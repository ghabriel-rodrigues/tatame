// "Adicionar aluno" bottom sheet (handoff professor-09): candidate rows
// with avatar initials and a "+ adicionar" action. Candidates come from the
// professor-visible pool (see TurmaDetailModel's API-gap note).

import DesignSystem
import SwiftUI
import TatameCore

struct AddStudentSheet: View {
    @Bindable var model: TurmaDetailModel
    let turmaName: String

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                Text("Adicionar aluno")
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text("Turma \(turmaName) · gestão compartilhada com o admin")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
            .padding(.top, LumiraTokens.Space.s6)

            if let actionError = model.actionError {
                Text(actionError)
                    .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.danger500)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(LumiraTokens.Space.s3)
                    .background(LumiraTokens.Colors.danger100)
                    .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                    .accessibilityIdentifier("add-student-error")
            }

            switch model.candidatesPhase {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, LumiraTokens.Space.s8)
            case .failed(let message):
                EnrollmentErrorBanner(message: message) {
                    Task { await model.loadCandidates() }
                }
            case .loaded(let candidates):
                if candidates.isEmpty {
                    Text("Nenhum aluno disponível para adicionar.")
                        .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg3)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, LumiraTokens.Space.s8)
                } else {
                    ScrollView {
                        VStack(spacing: LumiraTokens.Space.s3) {
                            ForEach(candidates) { candidate in
                                CandidateRow(student: candidate) {
                                    Task { await model.add(candidate) }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, LumiraTokens.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(LumiraTokens.Colors.bgApp)
    }
}

private struct CandidateRow: View {
    let student: RosterStudent
    let onAdd: () -> Void

    var body: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            AvatarCircle(initials: NameInitials.from(student.fullName))
            Text(student.fullName)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Spacer()
            Button(action: onAdd) {
                Text("+ adicionar")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
            }
            .accessibilityIdentifier("add-candidate-\(student.studentId.uuidString.lowercased())")
        }
        .padding(.horizontal, LumiraTokens.Space.s4)
        .padding(.vertical, LumiraTokens.Space.s3)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }
}
