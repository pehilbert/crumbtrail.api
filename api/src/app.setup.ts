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
  const origins = config.get('CORS_ORIGINS', { infer: true });
  // Browser frontends on these origins may call the API and send the refresh
  // cookie. Registered before the CSRF check so its 403s carry CORS headers.
  if (origins.length > 0)
    app.enableCors({ origin: origins, credentials: true });
  // Rejects state-changing browser requests from any other origin.
  app.enableCsrfProtection({ trustedOrigins: origins });

  if (config.get('SWAGGER_ENABLED', { infer: true })) setupSwagger(app);
  return app;
}
