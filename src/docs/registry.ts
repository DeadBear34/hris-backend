// Router utama didaftarkan di sini oleh route.ts, supaya pembangkit
// dokumentasi bisa membacanya tanpa import melingkar
// (route.ts → docsRoute → docsController → route.ts)

let apiRouter: unknown = null;

export function registerApiRouter(router: unknown): void {
  apiRouter = router;
}

export function getApiRouter(): unknown {
  if (!apiRouter) throw new Error("API router has not been registered");
  return apiRouter;
}
