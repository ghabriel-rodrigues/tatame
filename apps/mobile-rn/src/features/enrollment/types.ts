/**
 * Local aliases over the generated contract for the enrollment RN slice
 * (ENR.17-20). The shared package aliases the admin/professor shapes;
 * the responsável shapes are aliased here until a shared bump.
 */

import type { ApiSchemas } from '@tatame/shared';

export type DependentDetail = ApiSchemas['DependentDetailDto'];
export type DependentClass = ApiSchemas['DependentClassDto'];
export type ClassSuggestion = ApiSchemas['ClassSuggestionDto'];
export type RegisterDependentResponse =
  ApiSchemas['RegisterDependentResponseDto'];
