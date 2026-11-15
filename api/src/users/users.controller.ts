import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AccessToken, accessTokenSchema } from '../auth/auth.views.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { AUTH_THROTTLE } from '../auth/throttle.js';
import {
  ApiErrors,
  CLEARS_REFRESH_COOKIE,
  SETS_REFRESH_COOKIE,
} from '../openapi/openapi.js';
import { TokenService } from '../security/token.service.js';
import { RefreshCookie } from '../sessions/refresh-cookie.js';
import { SessionsService } from '../sessions/sessions.service.js';
import type { User } from './user.schema.js';
import {
  type DeactivatedUser,
  deactivatedUserSchema,
  type PrivateProfile,
  privateProfileSchema,
  type PublicProfile,
  publicProfileSchema,
  toPrivateProfile,
  toPublicProfile,
} from './user.views.js';
import {
  type CreateUserDto,
  createUserSchema,
  type UpdateUserDto,
  updateUserSchema,
  userIdSchema,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
    private readonly refreshCookie: RefreshCookie,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a user',
    description:
      'Username and email must be unique (case-insensitive). Returns an access token and sets the refresh cookie, ' +
      'so the new user is logged in. Rate limited.',
  })
  @ApiCreatedResponse({
    description: 'Registered and logged in',
    standardSchema: accessTokenSchema,
    headers: SETS_REFRESH_COOKIE,
  })
  @ApiErrors(400, { 409: 'Username or email already taken' }, 429)
  async register(
    @Body({ schema: createUserSchema }) dto: CreateUserDto,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<AccessToken> {
    const user = await this.users.create(dto);
    this.refreshCookie.set(response, await this.sessions.start(user._id));
    return { id: user._id, accessToken: await this.tokens.issue(user._id) };
  }

  // Declared before ':id' so "me" is not treated as an ID.
  @Get('me')
  @ApiOperation({ summary: 'Get my private profile' })
  @ApiOkResponse({
    description: 'The caller, including email',
    standardSchema: privateProfileSchema,
  })
  @ApiErrors(401)
  me(@CurrentUser() user: User): PrivateProfile {
    return toPrivateProfile(user);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: "Get a user's public profile" })
  @ApiOkResponse({
    description: 'The public profile',
    standardSchema: publicProfileSchema,
  })
  @ApiErrors(
    { 400: 'Invalid user ID (not a GUID)' },
    { 404: 'User does not exist or is deactivated' },
  )
  async findOne(
    @Param('id', { schema: userIdSchema }) id: string,
  ): Promise<PublicProfile> {
    const user = await this.users.findActiveById(id);
    if (!user) throw new NotFoundException('User not found');
    return toPublicProfile(user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update my profile',
    description:
      'Omitted fields are left unchanged; "pronouns": null clears pronouns. Only the user themselves may update.',
  })
  @ApiOkResponse({
    description: 'The updated private profile',
    standardSchema: privateProfileSchema,
  })
  @ApiErrors(
    { 400: 'Invalid ID, or invalid or empty body' },
    401,
    { 403: 'ID does not match the token user' },
    { 409: 'Username already taken' },
  )
  async update(
    @Param('id', { schema: userIdSchema }) id: string,
    @CurrentUser() currentUser: User,
    @Body({ schema: updateUserSchema }) dto: UpdateUserDto,
  ): Promise<PrivateProfile> {
    assertSelf(currentUser, id);
    const user = await this.users.update(id, dto);
    if (!user) throw new NotFoundException('User not found');
    return toPrivateProfile(user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deactivate my account',
    description:
      'Soft delete. The username and email stay reserved, existing tokens stop working, every session ends ' +
      'and the refresh cookie is cleared.',
  })
  @ApiOkResponse({
    description: 'Deactivated',
    standardSchema: deactivatedUserSchema,
    headers: CLEARS_REFRESH_COOKIE,
  })
  @ApiErrors({ 400: 'Invalid user ID' }, 401, {
    403: 'ID does not match the token user',
  })
  async deactivate(
    @Param('id', { schema: userIdSchema }) id: string,
    @CurrentUser() currentUser: User,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<DeactivatedUser> {
    assertSelf(currentUser, id);
    if (!(await this.users.deactivate(id))) {
      throw new NotFoundException('User not found');
    }
    await this.sessions.endAllForUser(id);
    this.refreshCookie.clear(response);
    return { id, active: false };
  }
}

function assertSelf(currentUser: User, id: string): void {
  if (currentUser._id !== id) {
    throw new ForbiddenException('You can only modify your own account');
  }
}
