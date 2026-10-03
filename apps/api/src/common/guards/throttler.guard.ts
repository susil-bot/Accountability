import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Rate-limit by the real client IP. Behind Cloudflare every request arrives from a Cloudflare edge IP,
 * so — only when TRUST_CLOUDFLARE=true, i.e. the origin is reachable solely through Cloudflare/Tunnel —
 * the CF-Connecting-IP header is used instead. Otherwise Express's `trust proxy` setting decides req.ip.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request & { clientIp?: string };
    // Set by originSecretMiddleware only after the Pages proxy's secret was verified.
    if (r.clientIp) return r.clientIp;
    const cf = r.headers['cf-connecting-ip'];
    if (process.env.TRUST_CLOUDFLARE === 'true' && typeof cf === 'string' && cf.length <= 64) return cf;
    return r.ip ?? 'unknown';
  }
}
