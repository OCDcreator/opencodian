/**
 * Blocklist Checker
 *
 * Checks bash commands against user-defined blocklist patterns.
 * Patterns are treated as case-insensitive regex with fallback to substring match.
 */

const MAX_PATTERN_LENGTH = 500;

/**
 * Check if a command matches any blocked pattern.
 *
 * @param command - The bash command to check
 * @param patterns - Array of blocked patterns (regex or substring)
 * @param enableBlocklist - Whether blocklist checking is enabled
 * @returns true if the command is blocked, false otherwise
 */
export function isCommandBlocked(
  command: string,
  patterns: string[],
  enableBlocklist: boolean
): boolean {
  if (!enableBlocklist) {
    return false;
  }

  return patterns.some((pattern) => {
    if (pattern.length > MAX_PATTERN_LENGTH) {
      // Long patterns use substring match for safety
      return command.toLowerCase().includes(pattern.toLowerCase());
    }
    try {
      // Try regex match (case-insensitive)
      return new RegExp(pattern, 'i').test(command);
    } catch {
      // Invalid regex - fall back to substring match
      return command.toLowerCase().includes(pattern.toLowerCase());
    }
  });
}
