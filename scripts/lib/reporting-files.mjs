import fs from 'node:fs';
import { assertPrivateArtifact } from './private-artifacts.mjs';

export function readReportingFile(file) {
  const target = assertPrivateArtifact(file), stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('REPORTING_FILE_TOO_LARGE_OR_INVALID');
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

// Preserve complete native evidence on disk. Return guidance/instructions in full,
// not page/history content, so the coordinator can obey them before any edit.
export function summarizePageRead(page) {
  const p = page.structuredContent || page;
  if (page.isError || p.error || !p.content?.page_id || !Array.isArray(p.content.blocks)) throw new Error('PAGE_READ_UNAVAILABLE');
  return {
    pageId: p.content.page_id,
    blockCount: p.content.blocks.length,
    wholePageComplete: p.excerpt_selection ? p.excerpt_selection.whole_page_complete === true : p.selection ? p.selection.whole_page_complete === true : true,
    metadata: p.metadata || null,
    guidance: page.guidance ?? p.guidance ?? null,
    toolMeta: page._meta || null,
    toolText: Array.isArray(page.content) ? page.content.filter(c=>c.type === "text").map(c=>c.text) : [],
    instructions: p.content.blocks.filter(b => b.kind === 'agent_instructions').map(b => ({id:b.id, markdown:b.markdown})),
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
