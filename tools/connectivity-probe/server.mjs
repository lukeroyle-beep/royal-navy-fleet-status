// Gate A fixture only. No fleet imports, subprocesses, filesystem writes or outbound requests.
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const POLICY = 'rnfs-connectivity-fixture-v1';
export const PORT = 43187;
const MAX_BYTES = 8192;
const MAX_RECEIPTS = 256;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const validId = value => typeof value === 'string' && UUID.test(value);
const schema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const requestIdSchema = { type: 'string', pattern: UUID.source };
const tools = [
  { name: 'connectivity_probe', description: 'Harmless Gate A probe; returns a service receipt. No operational capabilities.',
    inputSchema: schema({ requestId: requestIdSchema, operation: { type: 'string', const: 'connectivity_probe' }, policyVersion: { type: 'string', const: POLICY } }) },
  { name: 'get_receipt', description: 'Retrieve an existing fixture receipt by request ID, from this process only.', inputSchema: schema({ requestId: requestIdSchema }) },
];

export function createFixture({ audit = () => {} } = {}) {
  const instanceId = randomUUID();
  const bundleDigest = hash(readFileSync(new URL('./server.mjs', import.meta.url)));
  const runtimeDigest = hash(readFileSync(process.execPath));
  const receipts = new Map();
  const result = (value, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], isError });
  const reject = code => result({ result: 'REJECTED', code }, true);
  function probe(args) {
    const startedAt = new Date().toISOString();
    if (!object(args) || !validId(args.requestId)) return reject('INVALID_REQUEST_ID');
    if (receipts.has(args.requestId)) return reject('REPLAY');
    if (receipts.size >= MAX_RECEIPTS) return reject('CAPACITY');
    let code = 'CONNECTED';
    if (!exact(args, ['requestId', 'operation', 'policyVersion'])) code = 'INVALID_FIELDS';
    else if (args.operation !== 'connectivity_probe') code = 'UNKNOWN_OPERATION';
    else if (args.policyVersion !== POLICY) code = 'POLICY_MISMATCH';
    const output = { result: code === 'CONNECTED' ? 'PASS' : 'REJECTED', code };
    const receipt = {
      requestId: args.requestId, operation: 'connectivity_probe', policyVersion: POLICY,
      requestDigest: hash(JSON.stringify(args)), bundleDigest, runtimeDigest, instanceId,
      executionIdentity: { uid: process.getuid(), gid: process.getgid(), pid: process.pid },
      runtime: process.version, startedAt, finishedAt: new Date().toISOString(),
      ...output, outputHashes: { response: hash(JSON.stringify(output)) },
      provenance: 'service-observed-request; scheduler provenance must be independently correlated',
    };
    receipt.receiptDigest = hash(JSON.stringify(receipt));
    // Write audit before acknowledging. A sink failure produces no successful response.
    audit(receipt);
    receipts.set(args.requestId, receipt);
    return result(receipt, code !== 'CONNECTED');
  }
  function dispatch(message) {
    if (!object(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
        Object.keys(message).some(k => !['jsonrpc', 'id', 'method', 'params'].includes(k))) {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
    }
    const id = message.id;
    if (id === undefined) return null;
    if (!(typeof id === 'string' || Number.isSafeInteger(id))) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid ID' } };
    const reply = value => ({ jsonrpc: '2.0', id, result: value });
    if (message.method === 'initialize') return reply({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'rnfs-connectivity-fixture', version: '1.0.0' } });
    if (message.method === 'ping') return reply({});
    if (message.method === 'tools/list') return reply({ tools });
    if (message.method !== 'tools/call') return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
    const params = message.params;
    if (!exact(params, ['name', 'arguments'])) return reply(reject('INVALID_TOOL_FIELDS'));
    if (params.name === 'connectivity_probe') return reply(probe(params.arguments));
    if (params.name !== 'get_receipt') return reply(reject('UNKNOWN_TOOL'));
    const args = params.arguments;
    if (!exact(args, ['requestId']) || !validId(args.requestId)) return reply(reject('INVALID_FIELDS'));
    return reply(receipts.has(args.requestId) ? result(receipts.get(args.requestId)) : reject('NOT_FOUND'));
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(value === undefined ? '' : JSON.stringify(value)); };
    const address = server.address();
    if (req.headers.host !== `127.0.0.1:${address.port}` || req.headers.origin !== undefined) return send(403);
    if (req.url !== '/mcp') return send(404);
    if (req.method !== 'POST') return send(405);
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return send(415);
    const chunks = []; let length = 0;
    try {
      for await (const chunk of req) { length += chunk.length; if (length > MAX_BYTES) { send(413); return; } chunks.push(chunk); }
      let message;
      try { message = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return send(400, { error: 'INVALID_JSON' }); }
      const value = dispatch(message);
      send(value === null ? 202 : 200, value ?? undefined);
    } catch { if (!res.headersSent) send(500, { error: 'FIXTURE_FAILURE' }); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('No command-line arguments permitted');
  const server = createFixture({ audit: receipt => process.stdout.write(`${JSON.stringify(receipt)}\n`) });
  server.listen(PORT, '127.0.0.1', () => process.stderr.write(`Fixture only: http://127.0.0.1:${PORT}/mcp\n`));
}
