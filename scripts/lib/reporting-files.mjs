import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { assertPrivateArtifact } from './private-artifacts.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const fail = code => { throw new Error(code); };

// JSON.parse loses duplicate object keys. Do not hide conflicting text by
// accepting its last value as a verified mirror. Run only after valid JSON.
function hasDuplicateKeys(text) {
  const stack = [];
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)) {
    const frame = stack.at(-1);
    if (token === '{') stack.push({ keys: new Set(), key: true });
    else if (token === '[') stack.push({});
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && frame?.keys) frame.key = true;
    else if (token === ':' && frame?.keys) frame.key = false;
    else if (token.startsWith('"') && frame?.key) {
      const key = JSON.parse(token);
      if (frame.keys.has(key)) return true;
      frame.keys.add(key);frame.key = false;
    }
  }
  return false;
}

function controlText(page, structured) {
  if (!Object.hasOwn(page, 'structuredContent')) return { text: [], metadata: [] };
  if (page.content !== undefined && !Array.isArray(page.content)) fail('PAGE_READ_ENVELOPE_INVALID');
  const text = [], metadata = [];
  for (const block of page.content || []) {
    if (!object(block) || block.type !== 'text' || typeof block.text !== 'string') fail('PAGE_READ_ENVELOPE_INVALID');
    const extra = without(block, ['type', 'text']);
    let parsed;
    try { parsed = JSON.parse(block.text); } catch { /* Independent prose is retained below. */ }
    const pageLike = object(parsed) && (Object.hasOwn(parsed, 'structuredContent') ||
      (object(parsed.content) && (Object.hasOwn(parsed.content, 'page_id') || Object.hasOwn(parsed.content, 'blocks'))));
    if (isDeepStrictEqual(parsed, structured)) {
      if (hasDuplicateKeys(block.text)) fail('PAGE_READ_TEXT_CONFLICT');
      if (Object.keys(extra).length) metadata.push({ kind: 'mirror', metadata: extra });
      continue;
    }
    if (pageLike) fail('PAGE_READ_TEXT_CONFLICT');
    // Independent JSON and prose may carry instructions; retain them verbatim.
    const textIndex = text.push(block.text) - 1;
    if (Object.keys(extra).length) metadata.push({ kind: 'text', textIndex, metadata: extra });
  }
  return { text, metadata };
}

export function readReportingFile(file) {
  const target = assertPrivateArtifact(file), stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('REPORTING_FILE_TOO_LARGE_OR_INVALID');
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

// Preserve complete native evidence on disk. Return guidance/instructions in full,
// not page/history content, so the coordinator can obey them before any edit.
export function summarizePageRead(page) {
  if (!object(page)) fail('PAGE_READ_UNAVAILABLE');
  const wrapped = Object.hasOwn(page, 'structuredContent');
  const p = wrapped ? page.structuredContent : page;
  if (!object(p) || page.isError || p.error || !p.content?.page_id || !Array.isArray(p.content.blocks) ||
      p.content.blocks.some(block => !object(block))) fail('PAGE_READ_UNAVAILABLE');
  const controls = controlText(page, p);
  // Known snapshot data can change under our own edits or between complete
  // read views. Raw guards/body/coverage remain in the private planning input;
  // completeness is checked separately on every read. Unknown controls stay.
  const controlFields = {
    payload: without(p, ['content', 'metadata', 'guidance', 'view', 'selection', 'excerpt_selection']),
    payloadGuidance: p.guidance ?? null,
    content: without(p.content, ['page_id', 'blocks', 'markdown', 'through_sequence', 'checkpoint_id']),
    envelope: wrapped ? without(page, ['structuredContent', 'content', 'guidance', '_meta', 'isError']) : {},
    textMetadata: controls.metadata,
  };
  return {
    pageId: p.content.page_id,
    blockCount: p.content.blocks.length,
    wholePageComplete: p.excerpt_selection ? p.excerpt_selection.whole_page_complete === true : p.selection ? p.selection.whole_page_complete === true : true,
    metadata: p.metadata || null,
    guidance: page.guidance ?? p.guidance ?? null,
    toolMeta: page._meta || null,
    toolText: controls.text,
    controlFields,
    instructions: p.content.blocks.filter(b => b.kind === 'agent_instructions'),
  };
}

export function reportingInputFromFiles(command, spec) {
  const event = readReportingFile(spec.event);
  if (command === 'plan') return {event, page:readReportingFile(spec.page), kind:spec.kind, savedAt:spec.at};
  if (command === 'confirm') return {event, page:readReportingFile(spec.page), plan:readReportingFile(spec.plan), confirmedAt:spec.at};
  if (command === 'finish') {
    if (!Array.isArray(spec.plans) || spec.plans.length !== 2 || !Array.isArray(spec.readbacks) || spec.readbacks.length !== 2) throw new Error('BOTH_REPORTING_FILES_REQUIRED');
    return {event, plans:spec.plans.map(readReportingFile), readbacks:spec.readbacks.map(readReportingFile)};
  }
  throw new Error('UNSUPPORTED_FILE_REPORTING_COMMAND');
}

export function summarizeReportingResult(command, result) {
  if (['plan','confirm'].includes(command)) return {pageId:result.page_id,eventId:result.eventId,kind:result.kind,operationCount:result.operations.length,superseded:!!result.superseded,confirmedAt:result.confirmedAt||null};
  if (command === 'pending') return {pending:result.map(e=>({eventId:e.eventId,runId:e.runId,outcome:e.outcome}))};
  return {id:result.id||null,eventId:result.eventId||result.event?.eventId||null,state:result.state||result.status||null,error:result.error||null};
}
