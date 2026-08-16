/**
 * Aluno Dados pessoais contract aliases (REP.10, spec 013). Local mirror
 * over the shared schema — UI code never digs through
 * `components["schemas"]` directly.
 */

import type { ApiSchemas } from '@tatame/shared';

export type AlunoProfileResponse = ApiSchemas['AlunoProfileResponseDto'];
export type UpdateAlunoProfile = ApiSchemas['UpdateAlunoProfileDto'];

export type ProfileGender = NonNullable<AlunoProfileResponse['gender']>;
