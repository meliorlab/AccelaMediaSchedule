import { build } from "esbuild";

// Pre-bundle the Express app (server/src + @msb/shared) into a single ESM file
// that the Vercel function (api/index.ts) imports. This removes any need for
// Vercel's compiler to resolve the monorepo TypeScript graph or workspace
// packages at deploy time — the classic cause of /api/* returning 404.
//
// Real runtime npm deps are kept external and resolved from node_modules on
// Vercel; only our own source and @msb/shared are inlined.
await build({
  entryPoints: ["server/src/app.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "api/_app.mjs",
  // Underscore-prefixed files in /api are ignored by Vercel's function router,
  // so _app.mjs will not be mistaken for its own serverless function.
  external: ["express", "cors", "pg", "pg-native", "exceljs"],
  logLevel: "info",
});

console.log("Bundled server -> api/_app.mjs");
