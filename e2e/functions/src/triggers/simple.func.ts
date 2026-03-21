import { onRequest } from 'firebase-functions/v2/https';

/**
 * Simple root-level function (no directory nesting).
 * Verifies that functions at the root of the triggers directory work.
 */
export default onRequest((req, res) => {
  res.json({
    message: 'Simple function at root level',
    functionName: process.env.FUNCTION_NAME || process.env.K_SERVICE || 'unknown',
  });
});
