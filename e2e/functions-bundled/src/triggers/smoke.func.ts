import { onRequest } from 'firebase-functions/v2/https';

/**
 * Bundler smoke test function.
 * Deployed after the bundler has produced a bundle from this source.
 * Verifies the cold-start optimization works end-to-end:
 *   - the function was discovered correctly by the bundler plugin
 *   - the bundled output starts up without error
 *   - only this module's code is present in the bundle
 */
const moduleLoadedAt = Date.now();
console.log(`[bench:bundler] stage=module_loaded ts=${moduleLoadedAt} pid=${process.pid}`);

export default onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    minInstances: 0,
    maxInstances: 1,
    concurrency: 1,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  (req, res) => {
    const bundler = String(req.query.bundler || 'unknown');
    const runId = String(req.query.runId || `run-${Date.now()}`);
    const functionName = process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FUNCTION_NAME || 'unknown';

    console.log(`[bench:bundler] bundler=${bundler} runId=${runId} stage=handler functionName=${functionName}`);

    res.status(200).json({
      ok: true,
      bundler,
      runId,
      functionName,
      pid: process.pid,
      moduleLoadedAt,
      processUptimeMs: Math.round(process.uptime() * 1000),
    });
  },
);
