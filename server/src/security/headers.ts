// Response security headers.
//
// Written by hand rather than pulling in helmet, because this API serves JSON to
// two known origins and nothing else — the handful of headers that actually
// matter here are easier to reason about, and to justify, as explicit lines than
// as a dependency whose defaults change between majors.
//
// What each one is defending against, since a header nobody can explain is a
// header nobody will maintain:
//
//   HSTS                     a downgrade to http on a later visit, where an
//                            attacker could read the session cookie
//   X-Content-Type-Options   a browser sniffing a JSON response as HTML and
//                            running script it finds inside it
//   X-Frame-Options / CSP    this API being framed to bait a click
//   Referrer-Policy          a contest or payment id leaking in the Referer
//                            header when a response links outward
//   x-powered-by removed     it names the framework and version for free
//
// A CSP on a JSON API is deliberately near-total denial: this origin should
// never load a script, a style or a frame, so saying "none" costs nothing and
// closes the door on a reflected-content mistake later.
import type { Request, Response, NextFunction } from 'express';

export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Express advertises itself by default.
    res.removeHeader('X-Powered-By');

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    // Browsers have their own defaults now, but an explicit deny is free and
    // covers older clients that still honour it.
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

    // HSTS only over a genuinely secure connection. Sending it over plain http
    // does nothing, and sending it from a local dev server would pin localhost
    // to https in the developer's browser for a year — a genuinely annoying
    // thing to debug later.
    const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http'));
    if (proto === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}
