import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db.js';
import { verifyToken } from './tokens.js';
import { toRlsUser, publicUser } from './users.js';
import type { RlsUser } from '../entities/rls.js';
import type { AppUser } from '@prisma/client';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RlsUser | null;
      appUser?: AppUser | null;
    }
  }
}

// Attaches req.user (RlsUser) + req.appUser from a Bearer token, if present.
// Never rejects — anonymous requests continue with req.user = null.
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = null;
  req.appUser = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.rk_token as string | undefined);
  if (token) {
    const payload = verifyToken(token);
    if (payload?.sub) {
      const u = await prisma.appUser.findUnique({ where: { id: payload.sub } });
      if (u) {
        req.appUser = u;
        req.user = toRlsUser(u);
      }
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

export { publicUser };
