import { onRequest } from 'firebase-functions/v2/https';

/**
 * Simple HTTP function that returns a greeting.
 * Used to verify basic function discovery and cold-start optimization.
 */
export default onRequest((req, res) => {
  const name = req.query.name || 'World';
  res.json({
    message: `Hello, ${name}!`,
    functionName: process.env.FUNCTION_NAME || process.env.K_SERVICE || 'unknown',
    timestamp: new Date().toISOString(),
  });
});
