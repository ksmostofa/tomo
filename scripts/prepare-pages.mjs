import { copyFile, cp, readFile, rm } from "node:fs/promises"

const client = new URL("../dist/client/", import.meta.url)
const server = new URL("../dist/server/", import.meta.url)
const vinextDeployOverride = new URL("../.wrangler/deploy/config.json", import.meta.url)

// Cloudflare Pages advanced mode: the vinext server becomes the Pages Worker,
// while static assets stay in the same deployment directory.
await rm(new URL("index.html", client), { force: true })
await copyFile(new URL("index.js", server), new URL("_worker.js", client))
// The generated SSR module lazily imports ../index.js during RSC handling.
await copyFile(new URL("index.js", server), new URL("index.js", client))
await copyFile(
  new URL("__vite_rsc_assets_manifest.js", server),
  new URL("__vite_rsc_assets_manifest.js", client),
)
await cp(new URL("ssr/", server), new URL("ssr/", client), {
  recursive: true,
  force: true,
})
// vinext emits a Worker deploy override. Pages must use the repository-level
// wrangler.jsonc, otherwise `wrangler pages deploy` follows the wrong path.
await rm(vinextDeployOverride, { force: true })

const routes = JSON.parse(await readFile(new URL("_routes.json", client), "utf8"))
if (!routes.exclude?.includes("/assets/*")) {
  throw new Error("Cloudflare Pages must bypass the worker for compiled assets")
}

console.log("Prepared dist/client for Cloudflare Pages advanced mode")
