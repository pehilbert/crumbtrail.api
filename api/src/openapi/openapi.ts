import { applyDecorators, type INestApplication } from '@nestjs/common';
import {
  ApiResponse,
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { z } from 'zod';

/** Where the Swagger UI and the raw JSON document are served. */
export const DOCS_PATH = 'api/docs';
export const DOCS_JSON_PATH = 'api/docs-json';

/** Marks an operation as public; `buildOpenApiDocument` turns it into `security: []`. */
export const PUBLIC_EXTENSION = 'x-public';

const BEARER = 'bearer';

/** Nest's standard error body, shared by every error response. */
export const errorResponseSchema = z
  .object({
    statusCode: z.int(),
    message: z.union([z.string(), z.array(z.string())]),
    error: z.string().optional(),
  })
  .meta({ id: 'ErrorResponse' });

const DEFAULT_ERROR_DESCRIPTIONS = {
  400: 'Invalid request (bad ID or body)',
  401: 'Missing or invalid token',
  403: 'Not allowed to modify this resource',
  404: 'Not found',
  409: 'Conflicts with an existing value',
  429: 'Too many attempts',
} as const;

type ErrorStatus = keyof typeof DEFAULT_ERROR_DESCRIPTIONS;

/**
 * Documents an endpoint's error responses. Pass the statuses it can return,
 * optionally with an endpoint-specific description:
 * `@ApiErrors(400, 401, { 404: 'Recipe not found or archived' })`.
 */
export function ApiErrors(
  ...errors: (ErrorStatus | Partial<Record<ErrorStatus, string>>)[]
): MethodDecorator & ClassDecorator {
  const descriptions = new Map<ErrorStatus, string>();
  for (const entry of errors) {
    if (typeof entry === 'number') {
      descriptions.set(entry, DEFAULT_ERROR_DESCRIPTIONS[entry]);
    } else {
      for (const [status, description] of Object.entries(entry)) {
        descriptions.set(Number(status) as ErrorStatus, description);
      }
    }
  }
  return applyDecorators(
    ...[...descriptions].map(([status, description]) =>
      ApiResponse({ status, description, standardSchema: errorResponseSchema }),
    ),
  );
}

/**
 * Builds the OpenAPI document. Every operation requires the bearer token
 * unless it is marked @Public().
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Crumbtrail API')
    .setDescription(
      'Backend for Crumbtrail, a recipe-sharing app. Send `Authorization: Bearer <accessToken>` ' +
        '(from POST /api/v1/users or /api/v1/auth/login) on every endpoint not marked as public. ' +
        "Errors use Nest's standard shape (ErrorResponse).",
    )
    .setVersion('1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      BEARER,
    )
    .addSecurityRequirements(BEARER)
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });

  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (
        operation &&
        typeof operation === 'object' &&
        PUBLIC_EXTENSION in operation
      ) {
        delete (operation as Record<string, unknown>)[PUBLIC_EXTENSION];
        (operation as { security?: unknown[] }).security = [];
      }
    }
  }
  return document;
}

/** Serves the Swagger UI at /api/docs and the JSON document at /api/docs-json. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(DOCS_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: DOCS_JSON_PATH,
    customSiteTitle: 'Crumbtrail API docs',
  });
}
