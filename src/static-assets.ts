import { stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import type { RequestHandler } from 'express';

export function preferredEncoding(header: string | undefined) {
  const qualities = new Map<string, number>();
  for (const part of (header ?? '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    const q = params.find((p) => p.trim().startsWith('q='));
    const value = q ? Number(q.trim().slice(2)) : 1;
    qualities.set(name, Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
  }
  const br = qualities.get('br') ?? qualities.get('*') ?? 0,
    gz = qualities.get('gzip') ?? qualities.get('*') ?? 0;
  return br > 0 && br >= gz ? 'br' : gz > 0 ? 'gzip' : undefined;
}

/** Select prebuilt assets; never compress on the request path or buffer an SSE stream. */
export function precompressedAssets(directory: string): RequestHandler {
  const root = resolve(directory);
  return async (req, res, next) => {
    if (!/\.(js|css|json|svg|html|obj|mtl)$/.test(req.path)) return next();
    res.vary('Accept-Encoding');
    if (req.headers.range) return next();
    const encoding = preferredEncoding(req.headers['accept-encoding']);
    if (!encoding) return next();
    let pathname: string;
    try {
      pathname = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) return next();
    const suffix = encoding === 'br' ? '.br' : '.gz';
    try {
      if (!(await stat(file + suffix)).isFile()) return next();
    } catch {
      return next();
    }
    res.type(extname(file));
    res.setHeader('Content-Encoding', encoding);
    const query = req.url.indexOf('?');
    req.url =
      query < 0 ? req.url + suffix : req.url.slice(0, query) + suffix + req.url.slice(query);
    next();
  };
}

export function assetCacheControl(path: string) {
  return /[\\/]assets[\\/].+-[\w-]{8,}\.(js|css)(\.(br|gz))?$/.test(path)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0, must-revalidate';
}
