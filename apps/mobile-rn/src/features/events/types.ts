/**
 * Local aliases over the generated contract for the events RN slice
 * (EVT.10-11). Same pattern as the enrollment/billing/agenda slices —
 * aliased here until a shared alias bump.
 */

import type { ApiSchemas } from '@tatame/shared';

export type EventRegistrationState = ApiSchemas['EventRegistrationStateDto'];
export type AlunoEventItem = ApiSchemas['AlunoEventItemDto'];
export type AlunoEventDetail = ApiSchemas['AlunoEventDetailResponseDto'];
export type RegisterEventResponse = ApiSchemas['RegisterEventResponseDto'];
export type ResponsavelEvent = ApiSchemas['ResponsavelEventDto'];
export type ResponsavelEventDependent = ApiSchemas['ResponsavelEventDependentDto'];
export type ResponsavelEventsResponse = ApiSchemas['ResponsavelEventsResponseDto'];
export type ProfessorUpcomingEvent = ApiSchemas['ProfessorUpcomingEventDto'];
export type CalendarEventItem = ApiSchemas['CalendarEventItemDto'];
