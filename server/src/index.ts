import { app } from "./app.js";

// Local development entry point. On Vercel the Express app is served by the
// serverless function in `api/[[...path]].ts` instead of this listener.
const PORT = Number(process.env.PORT) || 4000;

app.listen(PORT, () => {
  console.log(`Media Schedule Builder API running at http://localhost:${PORT}`);
});
