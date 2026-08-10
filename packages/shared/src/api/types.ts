/**
 * Convenience aliases over the generated schema (web-03). UI code imports
 * these names instead of digging through `components["schemas"][...]`.
 */
import type { components } from './schema.js';

export type ApiSchemas = components['schemas'];

export type MembershipView = ApiSchemas['MembershipViewDto'];
export type AuthSessionResponse = ApiSchemas['AuthSessionResponseDto'];
export type MfaChallengeResponse = ApiSchemas['MfaChallengeResponseDto'];
export type TokenPairResponse = ApiSchemas['TokenPairResponseDto'];
export type SwitchMembershipResponse = ApiSchemas['SwitchMembershipResponseDto'];
export type MeResponse = ApiSchemas['MeResponseDto'];
export type MeAcademy = ApiSchemas['MeAcademyDto'];
export type InviteLandingResponse = ApiSchemas['InviteLandingResponseDto'];
export type InviteAcceptResponse = ApiSchemas['InviteAcceptResponseDto'];
export type ImpersonationGrantResponse = ApiSchemas['ImpersonationGrantResponseDto'];

// Enrollment registry (ENR.13-16 web surface).
export type StudentListItem = ApiSchemas['StudentListItemDto'];
export type GuardianListItem = ApiSchemas['GuardianListItemDto'];
export type ProfessorListItem = ApiSchemas['ProfessorListItemDto'];
export type ScheduleSlotView = ApiSchemas['ScheduleSlotViewDto'];
export type ClassListItem = ApiSchemas['ClassListItemDto'];
export type ClassDetail = ApiSchemas['ClassDetailDto'];
export type RosterStudent = ApiSchemas['RosterStudentDto'];
export type MoveStudentsResponse = ApiSchemas['MoveStudentsResponseDto'];

// Attendance admin visibility (ATT.14 web surface).
export type AdminSessionRow = ApiSchemas['AdminSessionRowDto'];
export type AdminSessionListResponse = ApiSchemas['AdminSessionListResponseDto'];

// Attendance mobile surface (ATT.15-18).
export type CheckinRequest = ApiSchemas['CheckinRequestDto'];
export type CheckinResponse = ApiSchemas['CheckinResponseDto'];
export type AlunoStats = ApiSchemas['AlunoStatsDto'];
export type AlunoTodayClass = ApiSchemas['AlunoTodayClassDto'];
export type AlunoHomeResponse = ApiSchemas['AlunoHomeResponseDto'];
export type LiveCodeResponse = ApiSchemas['LiveCodeResponseDto'];
export type LiveSnapshotResponse = ApiSchemas['LiveSnapshotResponseDto'];
export type SnapshotAttendance = ApiSchemas['SnapshotAttendanceDto'];
export type StreamTicketResponse = ApiSchemas['StreamTicketResponseDto'];
export type LiveStreamCheckinEvent = ApiSchemas['LiveStreamCheckinEventDto'];
export type LiveStreamRevokeEvent = ApiSchemas['LiveStreamRevokeEventDto'];
export type RollCallResponse = ApiSchemas['RollCallResponseDto'];
export type RollCallRosterRow = ApiSchemas['RosterRowDto'];
export type RosterAttendance = ApiSchemas['RosterAttendanceDto'];
export type MarkAttendanceResponse = ApiSchemas['MarkAttendanceResponseDto'];
export type RevokeAttendanceResponse = ApiSchemas['RevokeAttendanceResponseDto'];
export type ProfessorDashboardResponse = ApiSchemas['ProfessorDashboardResponseDto'];
export type ProfessorStudent = ApiSchemas['ProfessorStudentDto'];

// Graduation web surface (GRD.12-14).
export type BeltView = ApiSchemas['BeltViewDto'];
export type BeltRef = ApiSchemas['BeltRefDto'];
export type GraduationActor = ApiSchemas['GraduationActorDto'];
export type GraduationEntry = ApiSchemas['GraduationEntryDto'];
export type GraduationHistoryResponse = ApiSchemas['GraduationHistoryResponseDto'];
export type GraduationRuleRow = ApiSchemas['GraduationRuleRowDto'];
export type GraduationRulesResponse = ApiSchemas['GraduationRulesResponseDto'];
export type GraduationRuleEntry = ApiSchemas['GraduationRuleEntryDto'];
export type UpdateGraduationRules = ApiSchemas['UpdateGraduationRulesDto'];
export type RevokeGraduationResponse = ApiSchemas['RevokeGraduationResponseDto'];
export type AwardGraduationResponse = ApiSchemas['AwardGraduationResponseDto'];
export type ValidGraduation = ApiSchemas['ValidGraduationDto'];
export type AlunoGraduationResponse = ApiSchemas['AlunoGraduationResponseDto'];

// Billing web surface (BIL.13-15).
export type AcademyPlan = ApiSchemas['PlanDto'];
export type PlanListResponse = ApiSchemas['PlanListResponseDto'];
export type CreatePlanRequest = ApiSchemas['CreatePlanDto'];
export type UpdatePlanRequest = ApiSchemas['UpdatePlanDto'];
export type BillingRecurrence = AcademyPlan['recurrence'];
export type RevenueMonth = ApiSchemas['RevenueMonthDto'];
export type UpcomingCharge = ApiSchemas['UpcomingChargeDto'];
export type UpcomingGroup = ApiSchemas['UpcomingGroupDto'];
export type DelinquentStudent = ApiSchemas['DelinquentStudentDto'];
export type MaterializationResult = ApiSchemas['MaterializationResultDto'];
export type AdminBillingOverview = ApiSchemas['AdminOverviewResponseDto'];
export type RepasseTotals = ApiSchemas['RepasseTotalsDto'];
export type RepasseRow = ApiSchemas['RepasseRowDto'];
export type RepassesResponse = ApiSchemas['RepassesResponseDto'];

// Store admin web surface (STO.8-9).
export type StoreOverviewResponse = ApiSchemas['StoreOverviewResponseDto'];
export type LowStockProduct = ApiSchemas['LowStockProductDto'];
export type StoreCategory = ApiSchemas['StoreCategoryDto'];
export type StoreCategoriesResponse = ApiSchemas['StoreCategoriesResponseDto'];
export type AdminStoreProduct = ApiSchemas['AdminProductDto'];
export type AdminStoreProductsResponse = ApiSchemas['AdminProductsResponseDto'];
export type StoreOrderItem = ApiSchemas['OrderItemDto'];
export type StoreOrderBuyer = ApiSchemas['OrderBuyerDto'];
export type AdminStoreOrder = ApiSchemas['AdminOrderDto'];
export type AdminStoreOrdersResponse = ApiSchemas['AdminOrdersResponseDto'];
export type StoreOrderStatus = AdminStoreOrder['status'];

export type AnyRoleName = MembershipView['role'];
export type AcademyRoleName = Extract<AnyRoleName, 'student' | 'professor' | 'admin' | 'guardian'>;
export type PlatformRoleName = Extract<AnyRoleName, 'owner' | 'support' | 'finance'>;
