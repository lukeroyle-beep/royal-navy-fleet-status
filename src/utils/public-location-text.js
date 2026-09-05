// Public location labels must never expose a local filesystem location.
export const PRIVATE_PATH_PATTERN = /file:\/\/|(?:^|[\s"'(])\/[\w.-]+\/\S+|\b[A-Za-z]:[\\/]|\\\\[^\\\s]+\\/i;

export function hasPrivateFilesystemPath(value) {
  return PRIVATE_PATH_PATTERN.test(value);
}
