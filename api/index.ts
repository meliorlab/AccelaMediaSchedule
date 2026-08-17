// Vercel serverless entry: a vercel.json rewrite forwards all /api/* requests
// here, and the shared Express app handles the internal routing.
// The app is pre-bundled to ./_app.mjs during the build (see scripts/build-api.mjs)
// so Vercel doesn't have to resolve the monorepo TypeScript graph at deploy time.
// No app.listen() — Vercel invokes the exported handler.
// @ts-expect-error - generated at build time by scripts/build-api.mjs
import app from "./_app.mjs";

export default app;
