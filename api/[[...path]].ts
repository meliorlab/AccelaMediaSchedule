// Vercel serverless entry: all /api/* requests are routed here and handled by
// the shared Express app. No app.listen() — Vercel invokes the exported handler.
import app from "../server/src/app.js";

export default app;
