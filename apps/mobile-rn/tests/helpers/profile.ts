/**
 * Aluno profile fixtures for the RN suites (REP.10, spec 013). Shaped to
 * aluno-18: Lucas Almeida with CPF/RG set (locked state) and the full
 * contato/endereço/emergência sections filled.
 */

import type { ApiSchemas } from '@tatame/shared';

type AlunoProfileResponse = ApiSchemas['AlunoProfileResponseDto'];

/** aluno-18 "completo": locked documents, full address + emergency. */
export function makeAlunoProfile(
  overrides: Partial<AlunoProfileResponse> = {},
): AlunoProfileResponse {
  return {
    fullName: 'Lucas Almeida',
    email: 'lucas.almeida@email.com',
    birthDate: '1998-03-14',
    phone: '(11) 98765-4321',
    gender: 'male',
    cpf: '12345678900',
    cpfLocked: true,
    rg: '12.345.678-9',
    rgLocked: true,
    addressLine: 'Rua das Palmeiras, 120, ap 42',
    addressCity: 'São Paulo',
    addressState: 'SP',
    addressZip: '01310100',
    emergencyContactName: 'Carla Almeida',
    emergencyContactPhone: '(11) 91234-5678',
    avatarUrl: null,
    ...overrides,
  };
}

/** First-login state: documents still unset (editable inputs). */
export function makeEmptyAlunoProfile(
  overrides: Partial<AlunoProfileResponse> = {},
): AlunoProfileResponse {
  return makeAlunoProfile({
    phone: null,
    gender: null,
    cpf: null,
    cpfLocked: false,
    rg: null,
    rgLocked: false,
    addressLine: null,
    addressCity: null,
    addressState: null,
    addressZip: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    ...overrides,
  });
}
