import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const fail = () => { throw Object.assign(new Error('NATIVE_ENCRYPTION_QUERY_UNVERIFIED'), { diagnostic: 'NATIVE_ENCRYPTION_QUERY_UNVERIFIED' }); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

// Deliberately one canonical, non-executable request format. No JS evaluation,
// shell interpretation, receipt assertions or user-provided query stdout.
export function encryptionQueryCommand(mount) {
  return `/usr/sbin/diskutil info -plist ${quote(mount)}`;
}
export function encryptionQueryToolInput(mount) {
  return `text(await tools.exec_command(${JSON.stringify({ cmd: encryptionQueryCommand(mount), max_output_tokens: 4000 })}));`;
}

export function verifyNativeEncryptionQuery({ records, threadId, callId, mount, now }) {
  if (!threadId || !callId || !Number.isFinite(now)) fail();
  const meta = records.filter(r => r.type === 'session_meta');
  if (meta.length !== 1 || meta[0].payload?.id !== threadId) fail();
  const calls = records.filter(r => r.type === 'response_item' && r.payload?.type === 'custom_tool_call' && r.payload.call_id === callId);
  const outputs = records.filter(r => r.type === 'response_item' && r.payload?.type === 'custom_tool_call_output' && r.payload.call_id === callId);
  if (calls.length !== 1 || outputs.length !== 1) fail();
  const call = calls[0], output = outputs[0];
  if (records.indexOf(output) <= records.indexOf(call)) fail();
  if (call.payload.name !== 'exec' || call.payload.input.trim() !== encryptionQueryToolInput(mount)) fail();
  const requestedAt = Date.parse(call.timestamp), completedAt = Date.parse(output.timestamp);
  if (![requestedAt, completedAt].every(Number.isFinite) || completedAt < requestedAt || completedAt > now || now - requestedAt > 60000) fail();
  let blocks = output.payload.output;
  if (typeof blocks === 'string') { try { blocks = JSON.parse(blocks); } catch { fail(); } }
  if (!Array.isArray(blocks)) fail();
  const results = blocks.flatMap(block => {
    if (block.type !== 'input_text' || typeof block.text !== 'string') return [];
    try { const value = JSON.parse(block.text); return Object.hasOwn(value, 'exit_code') ? [value] : []; } catch { return []; }
  });
  if (results.length !== 1 || results[0].exit_code !== 0 || typeof results[0].output !== 'string') fail();
  const plist = results[0].output;
  if (Buffer.byteLength(plist) > 32000 || !plist.includes('<plist') || !plist.includes('</plist>')) fail();
  const read = (key, type) => {
    const hits = [...plist.matchAll(new RegExp(`<key>${key}</key>\\s*(${type === 'bool' ? '<(?:true|false)\\s*/>' : '<string>[^<]*</string>'})`, 'g'))];
    if (hits.length !== 1) fail();
    if (type === 'bool') return /^<true\s*\/>$/.test(hits[0][1]);
    return hits[0][1].slice(8,-9).replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'");
  };
  const identity = Object.fromEntries(['MountPoint','DeviceIdentifier','DeviceNode','VolumeUUID'].map(key => [key,read(key,'string')]));
  if (identity.MountPoint !== mount || !/^disk\d+(?:s\d+)+$/.test(identity.DeviceIdentifier) ||
      identity.DeviceNode !== `/dev/${identity.DeviceIdentifier}` || !/^[a-f0-9-]{36}$/i.test(identity.VolumeUUID) ||
      !read('FileVault','bool') || !read('Encryption','bool') || read('Locked','bool')) fail();
  return { ...identity, threadId, callId, requestedAt: call.timestamp, completedAt: output.timestamp,
    command: encryptionQueryCommand(mount), outputSha256: sha(plist), provenance: 'native-session-tool-result' };
}

// Read only this executor's protected Codex session journal. The evidence reference
// selects a tool call, not an asserted result. Native session storage must remain
// outside the executor's writable roots; do not grant it write access.
export function readNativeEncryptionQuery({ reference, mount, sourceRoot, environment = process.env, now = Date.now() }) {
  const threadId = environment.CODEX_THREAD_ID;
  if (!reference || reference.mode !== 'native-session' || !/^[a-f0-9-]{36}$/i.test(threadId || '')) fail();
  const root = fs.realpathSync(path.join(os.homedir(), '.codex', 'sessions'));
  // Only the current thread, in three adjacent date directories. No broad history
  // discovery and no caller-controlled transcript path or replacement contents.
  const candidates = reference.sessionPath ? [reference.sessionPath] : [];
  for (const offset of reference.sessionPath ? [] : [-1,0,1]) {
    const date = new Date(now + offset * 86400000).toISOString().slice(0,10).replaceAll('-',path.sep);
    const directory = path.join(root,date);
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory)) if (name.endsWith(`-${threadId}.jsonl`)) candidates.push(path.join(directory,name));
  }
  if (candidates.length !== 1) fail();
  const file = fs.realpathSync(candidates[0]);
  if (!file.startsWith(`${root}${path.sep}`) || !file.endsWith(`-${threadId}.jsonl`)) fail();
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) fail();
  const bytes = fs.readFileSync(file, 'utf8');
  const lines = bytes.split('\n');
  // A native append may be in progress. Never accept an incomplete selected result.
  if (lines.at(-1)) lines.pop();
  const records = lines.filter(Boolean).map(line => JSON.parse(line));
  const latest = records.findLast(r => r.type === 'response_item' && r.payload?.type === 'custom_tool_call' &&
    r.payload.name === 'exec' && r.payload.input?.trim() === encryptionQueryToolInput(mount));
  if (!latest) fail();
  const evidence = verifyNativeEncryptionQuery({ records, threadId, callId: latest.payload.call_id, mount, now });
  const volume = fs.statSync(mount), device = fs.statSync(evidence.DeviceNode);
  if (!device.isBlockDevice() || volume.dev !== device.rdev || volume.dev === fs.statSync(sourceRoot).dev) fail();
  return { ...evidence, mountedDevice: volume.dev };
}
