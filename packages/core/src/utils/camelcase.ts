/**
 * Convert a string to camelCase.
 * Handles kebab-case, snake_case, and space-separated strings.
 *
 * @example
 * camelCase('my-function') // 'myFunction'
 * camelCase('my_function') // 'myFunction'
 * camelCase('MyFunction')  // 'myFunction'
 */
export function camelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}
