import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildOperationalStatus, renderOperationalStatus, SOURCE_KINDS } from './lib/operational-status.mjs';

export const MAX_BYTES = 8 * 1024 * 1024;
export function readSource(kind, path) {
  if (!SOURCE_KINDS.includes(kind)) throw Error('invalid-source-kind');
  let fd;
  try {
    // Explicit regular files only. No discovery, subprocess, probe, lock or write.
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd);
    if (!before.isFile()) return { kind, error: 'not-regular-file' };
    if (before.size > MAX_BYTES) return { kind, error: 'oversized' };
    const bytes = Buffer.alloc(before.size + 1);
    const length = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const after = fs.fstatSync(fd);
    if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return { kind, error: 'invalid-input' };
    return { kind, data: JSON.parse(bytes.subarray(0, length).toString('utf8')) };
  } catch (e) {
    return { kind, error: e.code === 'ENOENT' ? 'missing' : e instanceof SyntaxError ? 'invalid-input' : 'unreadable' };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function main(args) {
  let format = 'json', now;
  const sources = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--text') format = 'text';
    else if (args[i] === '--at' && args[i+1]) now = args[++i];
    else if (args[i] === '--source' && args[i+1] && args[i+2]) {
      sources.push(readSource(args[++i], args[++i]));
    } else throw Error('invalid-arguments');
    if (sources.length > 32) throw Error('too-many-sources');
  }
  const report = buildOperationalStatus(sources, { now });
  process.stdout.write(format === 'text' ? renderOperationalStatus(report) : JSON.stringify(report, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch { process.stderr.write('Operational status: invalid request; no source contents or paths emitted.\n'); process.exitCode = 1; }
}
