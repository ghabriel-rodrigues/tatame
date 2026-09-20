/**
 * Shared admin-registry UI bits (ENR.13-16): initials avatar, status badge,
 * FAB, page-level toast state and PT-BR problem translation.
 */
import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import { Chip } from '@tatame/design-system';
import { ApiErrorCodes, parseProblem } from '@tatame/shared';
import { initials } from './format';

export function InitialsAvatar({ name }: { name: string }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: 34,
        height: 34,
        borderRadius: '10px',
        background: 'var(--brand-tint)',
        color: 'var(--brand-1)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </Box>
  );
}

/** Derived Ativo/Pendente badge (server-provided value, admin-07). */
export function StatusBadge({ badge }: { badge: 'ativo' | 'pendente' }) {
  return badge === 'ativo' ? (
    <Chip label="Ativo" tone="success" />
  ) : (
    <Chip label="Pendente" tone="warning" />
  );
}

/** Floating "+" action button (admin-07 bottom bar FAB). */
export function Fab({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      onClick={onPress}
      sx={{
        position: 'fixed',
        right: { xs: 20, md: 'calc(50% - 260px)' },
        bottom: 28,
        width: 52,
        height: 52,
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        background: 'linear-gradient(135deg, var(--brand-1), var(--brand-2))',
        color: 'var(--white, #FFFFFF)',
        fontSize: 26,
        lineHeight: 1,
        boxShadow: 'var(--shadow-glow, 0 8px 20px rgba(42, 18, 72, 0.25))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      +
    </Box>
  );
}

export interface ToastState {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

export function useToastState(): ToastState {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((next: string) => setMessage(next), []);
  const clear = useCallback(() => setMessage(null), []);
  return { message, show, clear };
}

/** PT-BR copy for the graduation problem codes (GRD.13-14). */
export function graduationErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  switch (problem?.code) {
    case ApiErrorCodes.GRADUATION_DEGREE_AT_MAX:
      return 'O aluno já está no número máximo de graus desta faixa.';
    case ApiErrorCodes.GRADUATION_BELT_INVALID_TARGET:
      return 'Faixa inválida para esta graduação.';
    case ApiErrorCodes.GRADUATION_ALREADY_REVERSED:
      return 'Esta graduação já foi revogada.';
    case ApiErrorCodes.GRADUATION_LESSONS_BELOW_MINIMUM:
      return 'Aulas por grau deve ser de no mínimo 10.';
    case ApiErrorCodes.GRADUATION_CANNOT_DISABLE_NON_KIDS_BELT:
      return 'Apenas faixas infantis podem ser desativadas.';
    case ApiErrorCodes.VALIDATION_FAILED:
      return 'Verifique os dados informados e tente novamente.';
    case ApiErrorCodes.TENANT_READ_ONLY:
      return 'Academia em modo somente leitura — alterações bloqueadas.';
    default:
      return 'Algo deu errado. Tente novamente.';
  }
}

/** PT-BR copy for the billing problem codes (BIL.13-14). */
export function billingErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  switch (problem?.code) {
    case ApiErrorCodes.PLAN_NAME_TAKEN:
      return 'Já existe um plano com esse nome.';
    case ApiErrorCodes.PLAN_ARCHIVED:
      return 'Este plano está arquivado e não aceita novos alunos.';
    case ApiErrorCodes.PLAN_NOT_FOUND:
      return 'Plano não encontrado.';
    case ApiErrorCodes.VALIDATION_FAILED:
      return 'Verifique os dados informados e tente novamente.';
    case ApiErrorCodes.TENANT_READ_ONLY:
      return 'Academia em modo somente leitura — alterações bloqueadas.';
    default:
      return 'Algo deu errado. Tente novamente.';
  }
}

/** PT-BR copy for the enrollment problem codes (client branches on `code`). */
export function enrollmentErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  switch (problem?.code) {
    case ApiErrorCodes.CLASS_FULL:
      return 'A turma está lotada.';
    case ApiErrorCodes.CLASS_ARCHIVED:
      return 'Esta turma foi arquivada.';
    case ApiErrorCodes.CLASS_CAPACITY_EXCEEDED:
      return 'A turma de destino não tem vagas para todos os alunos selecionados.';
    case ApiErrorCodes.ENROLLMENT_ALREADY_ENROLLED:
      return 'O aluno já está matriculado nesta turma.';
    case ApiErrorCodes.VALIDATION_FAILED:
      return 'Verifique os dados informados e tente novamente.';
    case ApiErrorCodes.TENANT_READ_ONLY:
      return 'Academia em modo somente leitura — cadastros bloqueados.';
    default:
      return 'Algo deu errado. Tente novamente.';
  }
}
