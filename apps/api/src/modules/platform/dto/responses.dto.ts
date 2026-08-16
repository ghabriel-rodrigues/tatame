import { ApiProperty } from '@nestjs/swagger';
import { PLATFORM_ROLES } from '../../../common/decorators.js';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pattern). The
 * controllers return the service objects untouched; these give `/docs-json`
 * truthful schemas so `openapi-typescript` emits a typed contract for the
 * plataforma console.
 */

const ACADEMY_STATUSES = ['trial', 'active', 'delinquent', 'suspended'] as const;

export class MrrPointDto {
  @ApiProperty({ example: '2026-08', description: 'YYYY-MM' })
  month!: string;

  @ApiProperty({ example: 1_924_000 })
  cents!: number;
}

export class AttentionRowDto {
  @ApiProperty({ format: 'uuid' })
  academyId!: string;

  @ApiProperty()
  academyName!: string;

  @ApiProperty({ enum: ['trial_ending', 'subscription_overdue'] })
  kind!: 'trial_ending' | 'subscription_overdue';

  @ApiProperty({ example: 'Trial termina em 9 dias' })
  reason!: string;
}

export class PlatformOverviewResponseDto {
  @ApiProperty({ description: 'Live subscription revenue this month, in cents' })
  mrrCents!: number;

  @ApiProperty({ nullable: true, type: Number, description: 'Whole percent vs. last month' })
  mrrDeltaPct!: number | null;

  @ApiProperty()
  academyCount!: number;

  @ApiProperty()
  studentCount!: number;

  @ApiProperty({ description: 'Delinquent share of non-suspended academies, one decimal' })
  delinquencyPct!: number;

  @ApiProperty({ type: [MrrPointDto] })
  series!: MrrPointDto[];

  @ApiProperty({ type: [AttentionRowDto] })
  attention!: AttentionRowDto[];
}

export class PlatformAcademyRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true, type: String })
  city!: string | null;

  @ApiProperty({ enum: ACADEMY_STATUSES })
  status!: (typeof ACADEMY_STATUSES)[number];

  @ApiProperty()
  studentCount!: number;

  @ApiProperty({ nullable: true, type: String })
  planName!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  planPriceCents!: number | null;

  @ApiProperty({ nullable: true, type: String })
  subscriptionStatus!: string | null;
}

export class PlatformAcademyListResponseDto {
  @ApiProperty({ type: [PlatformAcademyRowDto] })
  academies!: PlatformAcademyRowDto[];

  @ApiProperty()
  total!: number;
}

export class PendingPlanDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  priceCents!: number;
}

export class PlatformAcademyDetailDto extends PlatformAcademyRowDto {
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty()
  professorCount!: number;

  @ApiProperty()
  contactEmail!: string;

  @ApiProperty({ type: PendingPlanDto, nullable: true })
  pendingPlan!: PendingPlanDto | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  currentPeriodEnd!: string | null;
}

export class RegisterAcademyResponseDto {
  @ApiProperty({ type: PlatformAcademyDetailDto })
  academy!: PlatformAcademyDetailDto;

  @ApiProperty({ format: 'uuid' })
  adminUserId!: string;

  @ApiProperty()
  adminUserCreated!: boolean;

  @ApiProperty()
  passwordEmailSent!: boolean;
}

export class PlanFeatureDto {
  @ApiProperty({ example: 'store' })
  slug!: string;

  @ApiProperty({ example: 'Loja da academia' })
  label!: string;
}

export class PlatformPlanRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  priceCents!: number;

  @ApiProperty({ nullable: true, type: Number, description: 'null = unlimited' })
  studentLimit!: number | null;

  @ApiProperty({ type: [PlanFeatureDto], description: 'Inherited chips excluded when inheritsFrom is set' })
  features!: PlanFeatureDto[];

  @ApiProperty()
  academyCount!: number;

  @ApiProperty({ description: 'Derived from live subscriptions, never stored' })
  isMostSubscribed!: boolean;

  @ApiProperty({ nullable: true, type: String, description: 'Drives the "Tudo do X" chip' })
  inheritsFrom!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  sortOrder!: number;
}

export class PlatformPlanCatalogResponseDto {
  @ApiProperty({ type: [PlatformPlanRowDto] })
  plans!: PlatformPlanRowDto[];

  @ApiProperty({ type: [PlanFeatureDto], description: 'The plataforma-06 toggle rows' })
  featureRegistry!: PlanFeatureDto[];
}

export class PlatformTeamMemberDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: PLATFORM_ROLES })
  role!: (typeof PLATFORM_ROLES)[number];

  @ApiProperty()
  status!: string;
}

export class PlatformTeamResponseDto {
  @ApiProperty({ type: [PlatformTeamMemberDto] })
  members!: PlatformTeamMemberDto[];
}

export class InviteTeamMemberResponseDto {
  @ApiProperty({ type: PlatformTeamMemberDto })
  member!: PlatformTeamMemberDto;

  @ApiProperty()
  userCreated!: boolean;

  @ApiProperty()
  passwordEmailSent!: boolean;
}

export class PlatformIntegrationDto {
  @ApiProperty({ example: 'pix' })
  key!: string;

  @ApiProperty({ example: 'PIX' })
  initials!: string;

  @ApiProperty({ example: 'Pix · PSP TatamePay' })
  name!: string;

  @ApiProperty({ example: 'Liquidação instantânea · taxa 0,9%' })
  detail!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ description: 'v1 is read-only — the switch renders disabled' })
  configurable!: boolean;
}

export class PlatformIntegrationsResponseDto {
  @ApiProperty({ enum: ['simulated', 'stripe'] })
  provider!: 'simulated' | 'stripe';

  @ApiProperty({ type: [PlatformIntegrationDto] })
  integrations!: PlatformIntegrationDto[];
}
