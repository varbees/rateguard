export * from './types.js';
export * from './config.js';
export * from './runtime.js';
export * from './core/bounded-cache.js';
export * from './core/rate-limiter.js';
export * from './core/token-budget.js';
export * from './core/circuit-breaker.js';
export * from './core/event-emitter.js';
export * from './adapters/express.js';
export * from './adapters/fastify.js';
export * from './adapters/hono.js';
export * from './adapters/next.js';

import { RateGuardRuntime } from './runtime.js';
import { middleware as expressMiddleware } from './adapters/express.js';
import { rateguardPlugin } from './adapters/fastify.js';
import { rateguard } from './adapters/hono.js';
import { withRateGuard } from './adapters/next.js';
import type { RateGuardOptions } from './types.js';

/**
 * Convenience class that mirrors the Go SDK's top-level ergonomics.
 */
export class RateGuard {
  readonly runtime: RateGuardRuntime;

  constructor(options: RateGuardOptions = {}) {
    this.runtime = new RateGuardRuntime(options);
  }

  middleware() {
    return expressMiddleware(this.runtime);
  }

  fastify() {
    return (instance: Parameters<typeof rateguardPlugin>[0]) => rateguardPlugin(instance, this.runtime);
  }

  hono() {
    return rateguard(this.runtime);
  }

  withRateGuard<TContext = Record<string, never>>(handler: (request: Request, context: TContext) => Response | Promise<Response>) {
    return withRateGuard(handler, this.runtime);
  }

  static middleware(options: RateGuardOptions = {}) {
    return expressMiddleware(options);
  }

  static fastify(options: RateGuardOptions = {}) {
    return (instance: Parameters<typeof rateguardPlugin>[0]) => rateguardPlugin(instance, options);
  }

  static hono(options: RateGuardOptions = {}) {
    return rateguard(options);
  }

  static withRateGuard<TContext = Record<string, never>>(
    handler: (request: Request, context: TContext) => Response | Promise<Response>,
    options: RateGuardOptions = {},
  ) {
    return withRateGuard(handler, options);
  }
}
