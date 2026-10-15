export function resolveKnowsEndpoint(base, path) {
  const endpointPath = String(path || '/search').replace(/^\/+/, '')
  return new URL(endpointPath, `${String(base).replace(/\/+$/, '')}/`)
}
