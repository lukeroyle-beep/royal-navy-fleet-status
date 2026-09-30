import fs from 'node:fs';
import path from 'node:path';

// Resolve existing ancestors before creating anything. Worktrees, nested repos,
// symlinked parents and an existing symlink destination must all stay private.
export function assertPrivateArtifact(value) {
  if (!value || !path.isAbsolute(value)) throw new Error('Private artifact requires an absolute path');
  let existing = value;
  while (!fs.lstatSync(existing, { throwIfNoEntry: false })) existing = path.dirname(existing);
  const resolved = path.resolve(fs.realpathSync(existing), path.relative(existing, value));
  for (let parent = resolved; ; parent = path.dirname(parent)) {
    if (fs.existsSync(path.join(parent, '.git'))) throw new Error('Private artifacts must remain outside every checkout');
    if (parent === path.dirname(parent)) break;
  }
  return resolved;
}
