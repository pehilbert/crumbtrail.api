import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import { PUBLIC_EXTENSION } from '../openapi/openapi.js';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Lets a route or controller skip the global AuthGuard, and marks it as
 * needing no token in the OpenAPI document.
 */
export const Public = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    ApiExtension(PUBLIC_EXTENSION, true),
  );
