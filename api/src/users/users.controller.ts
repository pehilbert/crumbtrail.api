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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { AUTH_THROTTLE } from '../auth/throttle.js';
import { TokenService } from '../security/token.service.js';
import type { User } from './user.schema.js';
import {
  type PrivateProfile,
  type PublicProfile,
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

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body({ schema: createUserSchema }) dto: CreateUserDto,
  ): Promise<{ id: string; accessToken: string }> {
    const user = await this.users.create(dto);
    return { id: user._id, accessToken: await this.tokens.issue(user._id) };
  }

  // Declared before ':id' so "me" is not treated as an ID.
  @Get('me')
  me(@CurrentUser() user: User): PrivateProfile {
    return toPrivateProfile(user);
  }

  @Public()
  @Get(':id')
  async findOne(
    @Param('id', { schema: userIdSchema }) id: string,
  ): Promise<PublicProfile> {
    const user = await this.users.findActiveById(id);
    if (!user) throw new NotFoundException('User not found');
    return toPublicProfile(user);
  }

  @Patch(':id')
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
  async deactivate(
    @Param('id', { schema: userIdSchema }) id: string,
    @CurrentUser() currentUser: User,
  ): Promise<{ id: string; active: false }> {
    assertSelf(currentUser, id);
    if (!(await this.users.deactivate(id))) {
      throw new NotFoundException('User not found');
    }
    return { id, active: false };
  }
}

function assertSelf(currentUser: User, id: string): void {
  if (currentUser._id !== id) {
    throw new ForbiddenException('You can only modify your own account');
  }
}
