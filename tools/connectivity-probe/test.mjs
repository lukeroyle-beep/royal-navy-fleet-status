import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { createFixture, POLICY } from './server.mjs';
const audit = [];
const server = createFixture({ audit: receipt => audit.push(receipt) });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}/mcp`;
let count = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); count++; };
async function rpc(method, params, overrides = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params, ...overrides }) });
  return response.json();
}
async function call(name, args) {
  const response = await rpc('tools/call', { name, arguments: args });
  return JSON.parse(response.result.content[0].text);
}
const valid = () => ({ requestId: randomUUID(), operation: 'connectivity_probe', policyVersion: POLICY });
try {
  check((await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fixture-test', version: '1' } })).result.protocolVersion, '2025-03-26');
  check((await rpc('tools/list', {})).result.tools.map(t => t.name), ['connectivity_probe', 'get_receipt']);
  const request = valid();
  const receipt = await call('connectivity_probe', request);
  check(receipt.result, 'PASS');
  check(receipt.executionIdentity.uid, process.getuid());
  check(await call('get_receipt', { requestId: request.requestId }), receipt);
  const { receiptDigest, ...unsigned } = receipt;
  check(createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'), receiptDigest);
  check((await call('connectivity_probe', request)).code, 'REPLAY');
  check((await call('connectivity_probe', { ...valid(), operation: 'publication' })).code, 'UNKNOWN_OPERATION');
  check((await call('connectivity_probe', { ...valid(), extra: 'unexpected' })).code, 'INVALID_FIELDS');
  check((await call('connectivity_probe', { ...valid(), policyVersion: 'wrong' })).code, 'POLICY_MISMATCH');
  for (const key of ['argv', 'cwd', 'executable', 'env', 'path', 'url']) check((await call('connectivity_probe', { ...valid(), [key]: '../../forbidden' })).code, 'INVALID_FIELDS');
  check((await call('connectivity_probe', { ...valid(), requestId: '../../escape' })).code, 'INVALID_REQUEST_ID');
  check((await call('connectivity_probe', null)).code, 'INVALID_REQUEST_ID');
  check((await call('get_receipt', { requestId: randomUUID() })).code, 'NOT_FOUND');
  check((await call('get_receipt', { requestId: receipt.requestId, extra: 1 })).code, 'INVALID_FIELDS');
  check((await call('shell', { command: 'echo forbidden' })).code, 'UNKNOWN_TOOL');
  check((await rpc('exec', {})).error.code, -32601);
  check((await rpc('tools/list', {}, { extra: true })).error.code, -32600);
  const concurrent = valid();
  check((await Promise.all([call('connectivity_probe', concurrent), call('connectivity_probe', concurrent)])).map(x => x.code).sort(), ['CONNECTED', 'REPLAY']);
  check((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://forbidden.example' }, body: '{}' })).status, 403);
  check(await new Promise((resolve, reject) => { const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Host: 'forbidden.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end('{}'); }), 403);
  check((await fetch(url)).status, 405);
  check((await fetch(url + '/escape', { method: 'POST' })).status, 404);
  check((await fetch(url, { method: 'POST', body: '{}' })).status, 415);
  check((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  check((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(9000) })).status, 413);
  for (const record of audit) check(await call('get_receipt', { requestId: record.requestId }), record);
  console.log(JSON.stringify({ status: 'PASS', assertions: count, context: 'isolated-local-http-fixture-NOT-scheduled', receipts: audit }, null, 2));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
