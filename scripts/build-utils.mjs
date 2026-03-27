import { execSync } from 'child_process';

/**
 * Get current git branch name
 * @returns {string} Branch name or 'unknown' if git command fails
 */
export function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Sanitize branch name for use in BUILD_ID
 * - Replace '/' with '-' (branch names often contain slashes)
 * - Remove other non-alphanumeric characters except '-' and '_'
 * @param {string} branch - Raw branch name
 * @returns {string} Sanitized branch name
 */
export function sanitizeBranchName(branch) {
  return branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9\-_.]/g, '');
}

/**
 * Generate local timestamp string (YYYYMMDDHHmm)
 * Uses local timezone for easier debugging
 * @returns {string} 12-character timestamp
 */
export function getLocalTimeStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/**
 * Generate BUILD_ID from git branch and timestamp
 * Format: {sanitizedBranch}.{YYYYMMDDHHmm}
 * Example: fix-revert-model-toggle.202603271430
 * @returns {string} BUILD_ID
 */
export function generateBuildId() {
  const branch = sanitizeBranchName(getGitBranch());
  const timestamp = getLocalTimeStamp();
  return `${branch}.${timestamp}`;
}
