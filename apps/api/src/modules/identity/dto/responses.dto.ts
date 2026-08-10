import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACADEMY_ROLES, PLATFORM_ROLES } from '../../../common/decorators.js';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03). The
 * controllers still return the service objects untouched; these classes give
 * `/docs-json` truthful response schemas so `openapi-typescript` emits a
 * typed client contract for web and the mobile apps. Keep them mirroring the
 * service return types (`AuthService`, `InviteService`, `ImpersonationService`).
 */

const ALL_ROLES = [...ACADEMY_ROLES, ...PLATFORM_ROLES];

export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;
}

export class MembershipViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['academy', 'platform'] })
  type!: 'academy' | 'platform';

  @ApiProperty({ enum: ALL_ROLES })
  role!: (typeof ALL_ROLES)[number];

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  tenantId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  academyName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  academySlug!: string | null;

  @ApiProperty({ nullable: true, type: String })
  academyStatus!: string | null;

  @ApiProperty()
  status!: string;
}

export class AuthSessionResponseDto {
  @ApiProperty({ type: UserSummaryDto })
  user!: UserSummaryDto;

  @ApiProperty({ type: [MembershipViewDto] })
  memberships!: MembershipViewDto[];

  @ApiProperty({ format: 'uuid' })
  activeMembershipId!: string;

  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Access token TTL in seconds' })
  accessExpiresIn!: number;

  @ApiPropertyOptional({ description: 'Only for `body` transport; web gets the httpOnly cookie' })
  refreshToken?: string;
}

export class MfaChallengeResponseDto {
  @ApiProperty({ enum: [true] })
  mfaRequired!: true;

  @ApiProperty({ description: 'Short-lived token consumed by POST /auth/login/totp' })
  challengeToken!: string;
}

export class TokenPairResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Access token TTL in seconds' })
  accessExpiresIn!: number;

  @ApiPropertyOptional({ description: 'Only for `body` transport; web gets the httpOnly cookie' })
  refreshToken?: string;
}

export class SwitchMembershipResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Access token TTL in seconds' })
  accessExpiresIn!: number;

  @ApiProperty({ format: 'uuid' })
  activeMembershipId!: string;
}

/**
 * The typed white-label brand (spec 011, CFG.3 — the shipped cross-platform
 * `BrandInput` contract). Always a complete triplet of uppercase `#RRGGBB`
 * hexes; the field carrying it is nullable, the members never are.
 */
export class BrandThemeDto {
  @ApiProperty({ example: '#14213D', pattern: '^#[0-9A-F]{6}$' })
  deep!: string;

  @ApiProperty({ example: '#3A5FA8', pattern: '^#[0-9A-F]{6}$' })
  vibrant!: string;

  @ApiProperty({ example: '#E63946', pattern: '^#[0-9A-F]{6}$' })
  accent!: string;
}

export class MeUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String })
  avatarUrl!: string | null;

  @ApiProperty()
  locale!: string;
}

export class MeAcademyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ nullable: true, type: String })
  logoUrl!: string | null;

  @ApiProperty({
    nullable: true,
    type: BrandThemeDto,
    description: 'White-label 3-color brand (deep/vibrant/accent); null = default Tatame brand',
  })
  theme!: BrandThemeDto | null;
}

export class MeImpersonationDto {
  @ApiProperty()
  isImpersonated!: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  impersonatorUserId?: string | null;
}

export class MeResponseDto {
  @ApiProperty({ type: MeUserDto })
  user!: MeUserDto;

  @ApiProperty({ type: [MembershipViewDto] })
  memberships!: MembershipViewDto[];

  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: 'Null during impersonation' })
  activeMembershipId!: string | null;

  @ApiProperty({ enum: ALL_ROLES })
  activeRole!: (typeof ALL_ROLES)[number];

  @ApiProperty({ type: MeAcademyDto, nullable: true })
  academy!: MeAcademyDto | null;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  permissions!: Record<string, boolean>;

  @ApiProperty({ type: MeImpersonationDto })
  impersonation!: MeImpersonationDto;
}

/**
 * The Configurações identidade payload (spec 011, CFG.4) — everything the
 * admin can change on the academy record, plus the immutable slug for the
 * monogram/context header. Brand null = default Tatame brand.
 */
export class AdminAcademyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Immutable — invite URLs depend on it' })
  slug!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Always null in v1 (monogram logo)' })
  logoUrl!: string | null;

  @ApiProperty({ nullable: true, type: BrandThemeDto })
  brand!: BrandThemeDto | null;

  @ApiProperty()
  autoNotificationsEnabled!: boolean;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({ enum: [true] })
  accepted!: true;
}

export class InviteAcademyDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true, type: String })
  logoUrl!: string | null;

  @ApiProperty({
    nullable: true,
    type: BrandThemeDto,
    description: 'White-label 3-color brand (deep/vibrant/accent); null = default Tatame brand',
  })
  theme!: BrandThemeDto | null;
}

export class InviteLandingResponseDto {
  @ApiProperty({ enum: ['student', 'guardian'] })
  kind!: 'student' | 'guardian';

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  classId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  academyPlanId!: string | null;

  @ApiProperty({ type: InviteAcademyDto })
  academy!: InviteAcademyDto;
}

export class InviteAcceptResponseDto {
  @ApiProperty({ type: UserSummaryDto })
  user!: UserSummaryDto;

  @ApiProperty({ type: [MembershipViewDto] })
  memberships!: MembershipViewDto[];

  @ApiProperty({ format: 'uuid' })
  activeMembershipId!: string;

  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Access token TTL in seconds' })
  accessExpiresIn!: number;

  @ApiProperty({ description: 'Always in the body — the client stores it per its platform contract' })
  refreshToken!: string;

  @ApiPropertyOptional({
    description:
      'True when the invite-bound class was full (or archived) at accept time: signup succeeded, the enrollment was skipped (spec 003, story 39)',
  })
  enrollmentSkipped?: boolean;
}

export class CreateInviteResponseDto {
  @ApiProperty({ description: 'Raw invite token — returned exactly once' })
  token!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ enum: ['student', 'guardian'] })
  kind!: 'student' | 'guardian';
}

export class AttachInviteResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ enum: ACADEMY_ROLES })
  role!: (typeof ACADEMY_ROLES)[number];
}

export class ImpersonationAcademyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  status!: string;
}

export class ImpersonationGrantResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Access token TTL in seconds' })
  accessExpiresIn!: number;

  @ApiProperty({ description: 'Always in the body: the platform refresh cookie stays untouched' })
  refreshToken!: string;

  @ApiProperty({ format: 'date-time', description: '1-hour absolute cap' })
  expiresAt!: string;

  @ApiProperty({ type: ImpersonationAcademyDto })
  academy!: ImpersonationAcademyDto;
}

export class ResolvedPermissionDto {
  @ApiProperty({ enum: ACADEMY_ROLES })
  role!: (typeof ACADEMY_ROLES)[number];

  @ApiProperty({ description: 'Registry key, e.g. `invites.create`' })
  key!: string;

  @ApiProperty({ description: 'PT-BR handoff label (admin screen copy)' })
  label!: string;

  @ApiProperty()
  defaultAllowed!: boolean;

  @ApiProperty()
  allowed!: boolean;
}

/**
 * Active-member head counts for the admin-17 group headers ("N pessoas neste
 * papel" — spec 011, CFG.6). Toggleable roles only; admins have no toggle
 * group on that screen.
 */
export class RoleMemberCountsDto {
  @ApiProperty()
  professor!: number;

  @ApiProperty()
  student!: number;

  @ApiProperty()
  guardian!: number;
}

export class PermissionMatrixResponseDto {
  @ApiProperty({ type: [ResolvedPermissionDto] })
  permissions!: ResolvedPermissionDto[];

  @ApiProperty({ type: RoleMemberCountsDto })
  memberCounts!: RoleMemberCountsDto;
}

export class TotpSetupResponseDto {
  @ApiProperty({ description: 'Base32 provisioning secret' })
  secret!: string;

  @ApiProperty({ description: 'otpauth:// URI for authenticator apps' })
  otpauthUri!: string;
}

export class TotpEnableResponseDto {
  @ApiProperty({ type: [String], description: 'Single-use recovery codes — shown exactly once' })
  recoveryCodes!: string[];
}
