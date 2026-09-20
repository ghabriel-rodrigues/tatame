/**
 * Local aliases over the generated contract for the graduation RN slice
 * (GRD.16/17). Aliased here until a shared types.ts bump (same pattern as
 * the enrollment slice).
 */

import type { ApiSchemas } from '@tatame/shared';

export type BeltView = ApiSchemas['BeltViewDto'];
export type GraduationProgress = ApiSchemas['GraduationProgressDto'];
export type GraduationEntry = ApiSchemas['GraduationEntryDto'];
export type AlunoGraduationResponse = ApiSchemas['AlunoGraduationResponseDto'];
export type AlunoHomeGraduation = ApiSchemas['AlunoHomeGraduationDto'];
export type StudentProfileResponse = ApiSchemas['StudentProfileResponseDto'];
export type ProfessorProfileResponse =
  ApiSchemas['ProfessorProfileResponseDto'];
export type ValidGraduation = ApiSchemas['ValidGraduationDto'];
export type StudentNote = ApiSchemas['StudentNoteDto'];
export type AwardGraduationResponse = ApiSchemas['AwardGraduationResponseDto'];
