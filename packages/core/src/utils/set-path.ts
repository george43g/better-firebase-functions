/**
 * Set a deeply nested property on an object using an array path.
 * Creates intermediate objects as needed.
 *
 * @example
 * const obj = {};
 * setPath(obj, ['auth', 'onCreate'], handler);
 * // obj = { auth: { onCreate: handler } }
 */
export function setPath(obj: Record<string, any>, path: string[], value: unknown): Record<string, any> {
  if (path.length === 0) return obj;

  let current: Record<string, any> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, any>;
  }

  current[path[path.length - 1]] = value;
  return obj;
}
