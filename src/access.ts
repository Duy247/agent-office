/** Keep loopback defaults; a reverse proxy needs an explicitly configured HTTPS origin. */
export function allowsOfficeRequest(
  host: string | undefined,
  origin: string | undefined,
  port: number,
  publicOrigin?: unknown,
) {
  const allowed = new Map([[`127.0.0.1:${port}`, `http://127.0.0.1:${port}`]]);
  if (typeof publicOrigin === 'string') {
    try {
      const url = new URL(publicOrigin);
      if (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      )
        allowed.set(url.host, url.origin);
    } catch {
      /* Invalid optional configuration never widens access. */
    }
  }
  const expected = host && allowed.get(host);
  return !!expected && (!origin || origin === expected);
}
