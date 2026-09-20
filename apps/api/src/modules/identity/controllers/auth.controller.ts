import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { requireAuthContext } from '../../../common/auth-context.js';
import {
  AllowSuspended,
  AnyRole,
  DenyImpersonated,
  Public,
  Roles,
} from '../../../common/decorators.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import {
  AuthService,
  type AuthenticatedPayload,
  type IssuedTokens,
} from '../services/auth.service.js';
import { PasswordResetService } from '../services/password-reset.service.js';
import { TotpService } from '../services/totp.service.js';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  SwitchMembershipDto,
  TotpEnableDto,
  TotpLoginDto,
  type RefreshTransport,
} from '../dto/auth.dto.js';
import {
  AuthSessionResponseDto,
  ForgotPasswordResponseDto,
  MeResponseDto,
  MfaChallengeResponseDto,
  SwitchMembershipResponseDto,
  TokenPairResponseDto,
  TotpEnableResponseDto,
  TotpSetupResponseDto,
} from '../dto/responses.dto.js';

export const REFRESH_COOKIE = 'tatame_refresh';
/** Path-scoped to the auth endpoints (ticket 02 cookie contract). */
const REFRESH_COOKIE_PATH = '/v1/auth';

function meta(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly resets: PasswordResetService,
    private readonly totp: TotpService,
    private readonly cls: ClsService,
  ) {}

  private setRefreshCookie(res: Response, token: string, expires: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  /** Applies the client-selected refresh transport (cookie default). */
  private shapeTokens(
    res: Response,
    tokens: IssuedTokens,
    transport: RefreshTransport | undefined,
  ): { accessToken: string; accessExpiresIn: number; refreshToken?: string } {
    if ((transport ?? 'cookie') === 'cookie') {
      this.setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
      return {
        accessToken: tokens.accessToken,
        accessExpiresIn: tokens.accessExpiresIn,
      };
    }
    return {
      accessToken: tokens.accessToken,
      accessExpiresIn: tokens.accessExpiresIn,
      refreshToken: tokens.refreshToken,
    };
  }

  private shapeAuthenticated(
    res: Response,
    payload: AuthenticatedPayload,
    transport: RefreshTransport | undefined,
  ) {
    return {
      user: payload.user,
      memberships: payload.memberships,
      activeMembershipId: payload.activeMembershipId,
      ...this.shapeTokens(res, payload.tokens, transport),
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Credentials → token pair (or TOTP challenge) + memberships',
  })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  @ApiResponse({
    status: 202,
    type: MfaChallengeResponseDto,
    description: 'Platform 2FA challenge',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, meta(req));
    if (result.kind === 'mfa_required') {
      res.status(202);
      return { mfaRequired: true, challengeToken: result.challengeToken };
    }
    return this.shapeAuthenticated(res, result.payload, dto.transport);
  }

  @Public()
  @Post('login/totp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete platform 2FA login' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async loginTotp(
    @Body() dto: TotpLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.auth.completeTotpLogin(
      dto.challengeToken,
      dto.code,
      meta(req),
    );
    return this.shapeAuthenticated(res, payload, dto.transport);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rotate the refresh token (family-reuse detection)',
  })
  @ApiOkResponse({ type: TokenPairResponseDto })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw =
      dto.refreshToken ??
      (req as Request & { cookies?: Record<string, string> }).cookies?.[
        REFRESH_COOKIE
      ];
    if (!raw) {
      throw problem(
        401,
        ErrorCodes.AUTH_TOKEN_EXPIRED,
        'No refresh token presented',
      );
    }
    const tokens = await this.auth.refresh(raw);
    const transport = dto.transport ?? (dto.refreshToken ? 'body' : 'cookie');
    return this.shapeTokens(res, tokens, transport);
  }

  @AnyRole()
  @DenyImpersonated()
  @Post('switch')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Re-issue the access token for another owned membership',
  })
  @ApiOkResponse({ type: SwitchMembershipResponseDto })
  async switch(@Body() dto: SwitchMembershipDto) {
    return this.auth.switchMembership(
      requireAuthContext(this.cls),
      dto.membershipId,
    );
  }

  @AnyRole()
  @AllowSuspended()
  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke the current session (also ends impersonation)',
  })
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(requireAuthContext(this.cls));
    this.clearRefreshCookie(res);
  }

  @AnyRole()
  @DenyImpersonated()
  @Post('logout-all')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke ALL sessions of the account' })
  async logoutAll(@Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logoutAll(requireAuthContext(this.cls));
    this.clearRefreshCookie(res);
  }

  @AnyRole()
  @AllowSuspended()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Session bootstrap: user, memberships, context, toggles',
  })
  @ApiOkResponse({ type: MeResponseDto })
  async me() {
    return this.auth.me(requireAuthContext(this.cls));
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Request a reset email — 202 always (no enumeration)',
  })
  @ApiAcceptedResponse({ type: ForgotPasswordResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.resets.requestReset(dto.email);
    return { accepted: true };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Consume the single-use token; revokes all sessions',
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.resets.reset(dto.token, dto.newPassword);
  }

  @Roles('owner', 'support', 'finance')
  @DenyImpersonated()
  @Post('totp/setup')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Platform staff: generate the TOTP provisioning secret',
  })
  @ApiOkResponse({ type: TotpSetupResponseDto })
  async totpSetup() {
    const ctx = requireAuthContext(this.cls);
    const { user } = await this.auth.me(ctx);
    return this.totp.setup(ctx.userId, user.email);
  }

  @Roles('owner', 'support', 'finance')
  @DenyImpersonated()
  @Post('totp/enable')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Platform staff: arm TOTP, returns one-time recovery codes',
  })
  @ApiOkResponse({ type: TotpEnableResponseDto })
  async totpEnable(@Body() dto: TotpEnableDto) {
    return this.totp.enable(requireAuthContext(this.cls).userId, dto.code);
  }
}
