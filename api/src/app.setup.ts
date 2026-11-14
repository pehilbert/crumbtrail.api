import {
  type INestApplication,
  StandardSchemaValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.js';
import { setupSwagger } from './openapi/openapi.js';

/** HTTP setup shared by main.ts and the e2e tests. Routes are /api/v{n}/... */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('SWAGGER_ENABLED', { infer: true })) setupSwagger(app);
  return app;
}
