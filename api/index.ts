// Vercel serverless entry: a vercel.json rewrite forwards all /api/* requests
// here, and the shared Express app handles the internal routing.
// No app.listen() — Vercel invokes the exported handler.
import app from "../server/src/app.js";

export default app;
