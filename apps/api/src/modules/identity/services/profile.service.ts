import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { students, users, withTenant, type DbHandle, type DbTransaction } from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { GENDER_VALUES, type UpdateAlunoProfileDto } from '../dto/profile.dto.js';

export interface AlunoProfileView {
  fullName: string;
  email: string;
  birthDate: string | null;
  phone: string | null;
  gender: string | null;
  cpf: string | null;
  cpfLocked: boolean;
  rg: string | null;
  rgLocked: boolean;
  addressLine: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  avatarUrl: string | null;
}

/** The 27 federative units — the UF input validates against the real list. */
const UF_SET = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const PHONE_RE = /^[0-9()+\-\s]{8,20}$/;

type FieldError = { field: string; messages: string[] };

/** Mod-11 CPF checksum (both verifier digits); rejects same-digit sequences. */
export function isValidCpf(digits: string): boolean {
  if (!/^[0-9]{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  for (const length of [9, 10] as const) {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const expected = ((sum * 10) % 11) % 10;
    if (expected !== Number(digits[length])) return false;
  }
  return true;
}

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Aluno Dados pessoais (spec 013, REP.6 — aluno-18). The profile lives on the
 * auth-global `users` row (the person, not the tenant); the identity module
 * owns it. Email and birth date are read-only identity/auth facts — birth
 * date is SERVED from the linked student row when one exists in the active
 * academy (the enrollment record is the age-rule authority). CPF/RG are
 * write-once (422 `profile.field_locked` after set); name edits sync onto the
 * linked student row in the same transaction so rosters, chamada lists and
 * rankings never disagree with the profile. No audit row — self-service
 * personal data is not staff action (recorded decision).
 */
@Injectable()
export class ProfileService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async get(ctx: AuthContext & { tenantId: string }): Promise<AlunoProfileView> {
    return withTenant(this.appDb.db, tenantCtx(ctx), (tx) => this.read(tx, ctx));
  }

  async update(
    ctx: AuthContext & { tenantId: string },
    dto: UpdateAlunoProfileDto,
  ): Promise<AlunoProfileView> {
    // Read-only identity facts: ignored-with-422, never silently dropped.
    const readOnly = (['email', 'birthDate'] as const).filter((f) => dto[f] !== undefined);
    if (readOnly.length > 0) {
      throw problem(
        422,
        ErrorCodes.PROFILE_FIELD_READ_ONLY,
        'E-mail e data de nascimento não podem ser alterados pelo perfil',
        readOnly.map((field) => ({ field, messages: ['read-only field'] })),
      );
    }

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [current] = await tx
        .select({ cpf: users.cpf, rg: users.rg })
        .from(users)
        .where(eq(users.id, ctx.userId));
      if (!current) throw problem(404, ErrorCodes.NOT_FOUND, 'User not found');

      const errors: FieldError[] = [];
      const patch: Partial<typeof users.$inferInsert> = {};

      if (dto.fullName !== undefined) {
        const fullName = dto.fullName.trim();
        if (fullName.length < 2) {
          errors.push({ field: 'fullName', messages: ['Informe o nome completo'] });
        } else {
          patch.fullName = fullName;
        }
      }

      if (dto.gender !== undefined) {
        if (dto.gender !== null && !GENDER_VALUES.includes(dto.gender)) {
          errors.push({ field: 'gender', messages: ['Valor inválido'] });
        } else {
          patch.gender = dto.gender;
        }
      }

      if (dto.phone !== undefined) {
        if (dto.phone !== null && !PHONE_RE.test(dto.phone.trim())) {
          errors.push({ field: 'phone', messages: ['Telefone inválido'] });
        } else {
          patch.phone = dto.phone === null ? null : dto.phone.trim();
        }
      }

      if (dto.emergencyContactPhone !== undefined) {
        if (dto.emergencyContactPhone !== null && !PHONE_RE.test(dto.emergencyContactPhone.trim())) {
          errors.push({ field: 'emergencyContactPhone', messages: ['Telefone inválido'] });
        } else {
          patch.emergencyContactPhone =
            dto.emergencyContactPhone === null ? null : dto.emergencyContactPhone.trim();
        }
      }

      if (dto.emergencyContactName !== undefined) {
        patch.emergencyContactName = dto.emergencyContactName?.trim() || null;
      }
      if (dto.addressLine !== undefined) {
        patch.addressLine = dto.addressLine?.trim() || null;
      }
      if (dto.addressCity !== undefined) {
        patch.addressCity = dto.addressCity?.trim() || null;
      }

      if (dto.addressState !== undefined) {
        if (dto.addressState === null) {
          patch.addressState = null;
        } else {
          const uf = dto.addressState.trim().toUpperCase();
          if (!UF_SET.has(uf)) {
            errors.push({ field: 'addressState', messages: ['UF inválida'] });
          } else {
            patch.addressState = uf;
          }
        }
      }

      if (dto.addressZip !== undefined) {
        if (dto.addressZip === null) {
          patch.addressZip = null;
        } else {
          const cep = dto.addressZip.replace(/\D/g, '');
          if (!/^[0-9]{8}$/.test(cep)) {
            errors.push({ field: 'addressZip', messages: ['CEP inválido — use 8 dígitos'] });
          } else {
            patch.addressZip = cep;
          }
        }
      }

      // CPF — normalized to digits, checksum-validated, write-once.
      if (dto.cpf !== undefined) {
        const cpf = dto.cpf.replace(/\D/g, '');
        if (!isValidCpf(cpf)) {
          errors.push({ field: 'cpf', messages: ['CPF inválido'] });
        } else if (current.cpf === null) {
          patch.cpf = cpf;
        } else if (current.cpf !== cpf) {
          throw problem(422, ErrorCodes.PROFILE_FIELD_LOCKED, 'CPF não pode ser alterado após definido', [
            { field: 'cpf', messages: ['locked'] },
          ]);
        }
      }

      // RG — trimmed free format, write-once.
      if (dto.rg !== undefined) {
        const rg = dto.rg.trim();
        if (rg.length < 3) {
          errors.push({ field: 'rg', messages: ['RG inválido'] });
        } else if (current.rg === null) {
          patch.rg = rg;
        } else if (current.rg !== rg) {
          throw problem(422, ErrorCodes.PROFILE_FIELD_LOCKED, 'RG não pode ser alterado após definido', [
            { field: 'rg', messages: ['locked'] },
          ]);
        }
      }

      if (errors.length > 0) {
        throw problem(422, ErrorCodes.VALIDATION_FAILED, 'Request validation failed', errors);
      }

      if (Object.keys(patch).length > 0) {
        await tx.update(users).set(patch).where(eq(users.id, ctx.userId));
      }

      // Roster truth: the profile name and the student row never disagree —
      // same transaction, so a failed sync rolls the profile edit back.
      if (patch.fullName) {
        await tx
          .update(students)
          .set({ fullName: patch.fullName })
          .where(and(eq(students.userId, ctx.userId), eq(students.status, 'active')));
      }

      return this.read(tx, ctx);
    });
  }

  private async read(tx: DbTransaction, ctx: AuthContext): Promise<AlunoProfileView> {
    const [user] = await tx
      .select({
        fullName: users.fullName,
        email: users.email,
        birthDate: users.birthDate,
        phone: users.phone,
        gender: users.gender,
        cpf: users.cpf,
        rg: users.rg,
        addressLine: users.addressLine,
        addressCity: users.addressCity,
        addressState: users.addressState,
        addressZip: users.addressZip,
        emergencyContactName: users.emergencyContactName,
        emergencyContactPhone: users.emergencyContactPhone,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, ctx.userId));
    if (!user) throw problem(404, ErrorCodes.NOT_FOUND, 'User not found');

    // Birth-date authority: the linked student row of the active academy.
    const [student] = await tx
      .select({ birthDate: students.birthDate })
      .from(students)
      .where(and(eq(students.userId, ctx.userId), eq(students.status, 'active')));

    return {
      fullName: user.fullName,
      email: user.email,
      birthDate: student?.birthDate ?? user.birthDate,
      phone: user.phone,
      gender: user.gender,
      cpf: user.cpf,
      cpfLocked: user.cpf !== null,
      rg: user.rg,
      rgLocked: user.rg !== null,
      addressLine: user.addressLine,
      addressCity: user.addressCity,
      addressState: user.addressState,
      addressZip: user.addressZip,
      emergencyContactName: user.emergencyContactName,
      emergencyContactPhone: user.emergencyContactPhone,
      avatarUrl: user.avatarUrl,
    };
  }
}
