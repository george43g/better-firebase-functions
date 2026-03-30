import { onRequest } from 'firebase-functions/v2/https';

/**
 * Health check endpoint. Returns status and metadata about the function instance.
 * Used to verify nested function groups work correctly (http-healthCheck).
 */
export default onRequest((req, res) => {
  res.json({
    status: 'ok',
    version: '7.0.0',
    nodeVersion: process.version,
    functionName: process.env.FUNCTION_NAME || process.env.K_SERVICE || 'unknown',
    // This helps verify that only THIS module's dependencies were loaded
    loadedModules: Object.keys(require.cache).length,
  });
});
