/**
 * Local aliases over the generated contract for the agenda RN slice
 * (AGD.5-6). Same pattern as the enrollment/billing slices — aliased here
 * until a shared alias bump.
 */

import type { ApiSchemas } from '@tatame/shared';

export type AlunoAgendaResponse = ApiSchemas['AlunoAgendaResponseDto'];
export type AlunoAgendaClass = ApiSchemas['AlunoAgendaClassDto'];
export type AgendaOccupancy = ApiSchemas['AgendaOccupancyDto'];
export type CalendarResponse = ApiSchemas['CalendarResponseDto'];
export type CalendarClassItem = ApiSchemas['CalendarClassItemDto'];
export type CalendarBuckets = ApiSchemas['CalendarBucketsDto'];
