function resolveJestNodeOptions({
  existingNodeOptions = '',
  allowedNodeEnvironmentFlags = process.allowedNodeEnvironmentFlags,
  storageFile,
}) {
  const options = [existingNodeOptions].filter(Boolean);
  if (allowedNodeEnvironmentFlags.has('--localstorage-file')) {
    options.push(`--localstorage-file=${storageFile}`);
  }
  return options.join(' ');
}

module.exports = { resolveJestNodeOptions };
