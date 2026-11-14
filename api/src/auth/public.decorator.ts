import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Lets a route or controller skip the global AuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
