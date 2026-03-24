import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Authentication middleware: requires Bearer token matching CRON_SECRET
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');
  if (token !== config.CRON_SECRET) {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }

  next();
}
