/**
 * Dados pessoais pure helpers (REP.10, spec 013): CPF/CEP masks, the
 * Cidade / UF single-input parsing and the problem+json → per-field PT-BR
 * error mapping (field_locked / field_read_only / validation.failed).
 */

import { profileSaveError, PROFILE_GENERIC_ERROR } from '../../src/features/profile/copy';
import {
  formatCep,
  formatCpf,
  isoToBrDate,
  joinCityUf,
  maskCepInput,
  maskCpfInput,
  parseCityUf,
} from '../../src/features/profile/format';

describe('profile format (REP.10)', () => {
  it('masks stored CPF/CEP digits for display', () => {
    expect(formatCpf('12345678900')).toBe('123.456.789-00');
    expect(formatCep('01310100')).toBe('01310-100');
    // Unexpected lengths pass through untouched (defensive).
    expect(formatCpf('123')).toBe('123');
  });

  it('masks while typing', () => {
    expect(maskCpfInput('529982247')).toBe('529.982.247');
    expect(maskCpfInput('52998224725')).toBe('529.982.247-25');
    expect(maskCepInput('01310')).toBe('01310');
    expect(maskCepInput('01310100')).toBe('01310-100');
  });

  it('renders the read-only birth date as DD/MM/AAAA', () => {
    expect(isoToBrDate('1998-03-14')).toBe('14/03/1998');
  });

  it('joins and parses the Cidade / UF combined field', () => {
    expect(joinCityUf('São Paulo', 'SP')).toBe('São Paulo / SP');
    expect(joinCityUf('São Paulo', null)).toBe('São Paulo');
    expect(joinCityUf(null, null)).toBe('');

    expect(parseCityUf('Campinas / sp')).toEqual({ city: 'Campinas', state: 'SP' });
    expect(parseCityUf('Campinas')).toEqual({ city: 'Campinas', state: null });
    expect(parseCityUf('  ')).toEqual({ city: null, state: null });
    // Slash inside the city name: the LAST separator wins.
    expect(parseCityUf('Santa Bárbara d/Oeste / SP')).toEqual({
      city: 'Santa Bárbara d/Oeste',
      state: 'SP',
    });
  });

  it('maps profile.field_locked to the PT-BR lock messages', () => {
    const mapped = profileSaveError({
      status: 422,
      code: 'profile.field_locked',
      detail: 'CPF não pode ser alterado após definido',
      errors: [{ field: 'cpf', messages: ['locked'] }],
    });
    expect(mapped.fieldErrors['cpf']).toBe('CPF não pode ser alterado após definido.');
    expect(mapped.message).toBe('CPF não pode ser alterado após definido');
  });

  it('maps validation.failed field messages through as-is (server PT-BR)', () => {
    const mapped = profileSaveError({
      status: 422,
      code: 'validation.failed',
      errors: [
        { field: 'addressZip', messages: ['CEP inválido — use 8 dígitos'] },
        { field: 'addressState', messages: ['UF inválida'] },
      ],
    });
    expect(mapped.fieldErrors['addressZip']).toBe('CEP inválido — use 8 dígitos');
    expect(mapped.fieldErrors['addressState']).toBe('UF inválida');
    expect(mapped.message).toBe('Revise os campos destacados.');
  });

  it('maps profile.field_read_only and unknown errors', () => {
    const readOnly = profileSaveError({
      status: 422,
      code: 'profile.field_read_only',
      errors: [{ field: 'email', messages: ['read-only field'] }],
    });
    expect(readOnly.fieldErrors['email']).toBe('Campo somente leitura.');

    expect(profileSaveError(undefined).message).toBe(PROFILE_GENERIC_ERROR);
    expect(profileSaveError({}).message).toBe(PROFILE_GENERIC_ERROR);
  });
});
