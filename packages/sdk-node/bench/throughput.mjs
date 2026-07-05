// Real throughput benchmark for RateLimiter.increment(), mirroring the two
// scenarios in sdk-go/sharded_limiter_test.go (hot key, many keys). Node has
// no real thread parallelism for this in-process operation — the honest
// number here is single-threaded ops/sec, the actual ceiling a Node process
// hits under load.
//
// Run: node bench/throughput.mjs

import { RateLimiter } from '../dist/esm/core/rate-limiter.js';

function bench(name, keys, iterations) {
  const limiter = new RateLimiter({ clock: { now: () => Date.now() }, capacity: 50_000 });
  const options = {
    requestsPerSecond: 1_000_000,
    burst: 1_000_000,
    windowMs: 60_000,
    remoteRateLimitEndpoint: '',
    apiKey: undefined,
  };
  const keySet = Array.from({ length: keys }, (_, i) => `tenant-${i}`);

  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    limiter.increment(keySet[i % keys], options, 1);
  }
  const end = process.hrtime.bigint();

  const totalNs = Number(end - start);
  const nsPerOp = totalNs / iterations;
  const opsPerSec = 1e9 / nsPerOp;
  console.log(`${name.padEnd(24)} ${nsPerOp.toFixed(1).padStart(10)} ns/op   ${Math.round(opsPerSec).toLocaleString('en-US').padStart(14)} ops/sec`);
}

console.log(`node ${process.version}`);
bench('HotKey', 1, 2_000_000);
bench('ManyKeys (1024)', 1024, 2_000_000);
