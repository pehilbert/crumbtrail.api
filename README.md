# Crumbtrail API
Backend for my personal recipe sharing app, Crumbtrail.

## Using the API (frontend and other consumers)

- **[`docs/openapi.json`](docs/openapi.json)** is the OpenAPI 3 spec for every endpoint: paths, request bodies with their validation rules, response schemas, error codes and auth. It is generated from the code and checked by the e2e tests, so it always matches this branch. Use it to generate a typed client or to look up an endpoint.
- **[`docs/endpoints/`](docs/endpoints/)** has the prose contracts, including behaviour the spec can't express (for example, archived recipes return 404 to everyone).
- With the API running locally, Swagger UI is at http://localhost:3000/api/docs and the live spec at http://localhost:3000/api/docs-json.

Conventions a client needs:

- All routes are under `/api/v1`.
- Auth: get a token from `POST /api/v1/users` (register) or `POST /api/v1/auth/login`, then send `Authorization: Bearer <accessToken>`. Operations with `security: []` in the spec are public. Full flow in [`docs/endpoints/auth.txt`](docs/endpoints/auth.txt):
  - Access tokens are short-lived (15 minutes by default). Login and registration also set an httpOnly `crumbtrail_refresh` cookie that only the `/api/v1/auth` endpoints receive.
  - On a 401 from a protected call, call `POST /api/v1/auth/refresh` (it reads the cookie and needs no body), store the new access token and retry. Let only one refresh run at a time. If refresh returns 401 too, send the user to login.
  - `POST /api/v1/auth/logout` ends the session and clears the cookie.
  - Browsers must send credentials on the auth calls (Angular: `withCredentials: true`) from an origin listed in the API's `CORS_ORIGINS` (`http://localhost:4200` in `.env.example`). State-changing requests from other browser origins get 403.
- IDs are GUID strings. Timestamps are ISO 8601 strings.
- Errors use Nest's standard shape, `{ "statusCode": 400, "message": "..." or ["..."], "error": "Bad Request" }`.
