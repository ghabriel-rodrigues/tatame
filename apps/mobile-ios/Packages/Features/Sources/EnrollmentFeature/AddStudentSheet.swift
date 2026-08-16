// "Adicionar aluno" bottom sheet (handoff professor-09): candidate rows
// with avatar initials and a "+ adicionar" action. Candidates come from
// GET /professor/students?notEnrolledInClassId= (spec 004 closed the old
// roster-union workaround).

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
                    .font(.quicksand(size: LumiraTokens.FontSize.textLg, weight: .bold))
                    .foregroundStyle(ThemedColors.fg1)
                Text("Turma \(turmaName) · gestão compartilhada com o admin")
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                    .foregroundStyle(ThemedColors.fg4)
            }
            .padding(.top, LumiraTokens.Space.s6)

            if let actionError = model.actionError {
                Text(actionError)
                    .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                    .foregroundStyle(ThemedColors.danger500)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(LumiraTokens.Space.s3)
                    .background(ThemedColors.danger100)
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
                        .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                        .foregroundStyle(ThemedColors.fg3)
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
        .background(ThemedColors.bgApp)
    }
}

private struct CandidateRow: View {
    let student: RosterStudent
    let onAdd: () -> Void

    var body: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            AvatarCircle(initials: NameInitials.from(student.fullName))
            Text(student.fullName)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.fg1)
            Spacer()
            Button(action: onAdd) {
                Text("+ adicionar")
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.inkPurple)
            }
            .accessibilityIdentifier("add-candidate-\(student.studentId.uuidString.lowercased())")
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
