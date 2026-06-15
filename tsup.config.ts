import { defineConfig } from "tsup";

// Bundles the TypeScript engine into a single, dependency-free ESM script
// (scripts/leboncoin.mjs) that any agent sandbox can run with `node` — no
// `npm install` required at skill-use time. The committed bundle is verified
// reproducible in CI via `pnpm run check:build`.
//
// `ws` (the only runtime dependency) is force-bundled via noExternal so the
// published package needs nothing at install time. Its optional native addons
// (bufferutil / utf-8-validate) are require()'d inside a try/catch in ws and are
// kept external — at runtime that require throws and ws falls back to pure JS.
export default defineConfig({
  entry: { leboncoin: "src/cli.ts" },
  outDir: "scripts",
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  target: "node18",
  platform: "node",
  bundle: true,
  clean: false,
  minify: false,
  splitting: false,
  sourcemap: false,
  noExternal: [/^ws$/],
  external: ["bufferutil", "utf-8-validate"],
  banner: { js: "#!/usr/bin/env node" },
});
