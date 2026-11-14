import {
  type INestApplication,
  StandardSchemaValidationPipe,
  VersioningType,
} from '@nestjs/common';

/** HTTP setup shared by main.ts and the e2e tests. Routes are /api/v{n}/... */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  return app;
}
