import { Request, Response, NextFunction } from 'express';
import { httpRequestDurationHistogram } from '../lib/metrics';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics endpoint itself to avoid recursive measuring
  if (req.path === '/metrics' || req.path === '/health') {
    next();
    return;
  }

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;

    // Normalize route path to avoid high cardinality
    // Replace UUIDs and tokens with :param placeholders
    const route = req.route?.path || req.path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/[A-Za-z0-9]{12}$/g, ':token');

    httpRequestDurationHistogram.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      },
      duration
    );
  });

  next();
}
