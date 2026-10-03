// Dependency-free so the exact reviewed function can be rendered into a native
// functions cell. Adapters call supported tools; Node never authenticates to Pages.
export async function nativeReportingFlow(io) {
  let attempt;
  const plans = [], readbacks = [];
  // Only this documented volatile page timestamp is excluded. All other
  // metadata/control fields and full guidance remain part of the comparison.
  const guidance = s => {
    const metadata = s.metadata && Object.fromEntries(Object.entries(s.metadata).filter(([key])=>key!=='updated_at'));
    return JSON.stringify([s.pageId,metadata,s.guidance,s.toolMeta,s.toolText,s.instructions]);
  };
  try {
    const reviewed = await io.reviewed();
    if (reviewed.length !== 2 || reviewed.some(s=>!s.wholePageComplete)) throw Error('COMPLETE_REVIEWED_PAGES_REQUIRED');
    attempt = await io.begin();
    if (!io.eventDigest || attempt.eventDigest!==io.eventDigest) throw Error('QUEUED_EVENT_MISMATCH');
    for (let i=0; i<2; i++) {
      const read = async label => {
        const page = await io.read(i,label);
        const summary = await io.summary(page);
        if (!summary.wholePageComplete || guidance(summary)!==guidance(reviewed[i])) throw Error('PAGE_GUIDANCE_CHANGED');
        return page;
      };
      const apply = async plan => {
        if (!plan.operations.length) return;
        let raw;
        try { raw = await io.edit(plan); }
        catch { await read('unknown-save'); throw Error('PAGE_SAVE_UNKNOWN'); }
        const value = raw.structuredContent || raw;
        const operations = value.operation_results || value.error?.details?.operation_results;
        const complete = Array.isArray(operations) && operations.length===plan.operations.length &&
          operations.every((op,index)=>op.operation_index===index && (!op.status || op.status==='applied') &&
            !op.error_code && !op.rejection_reason && !op.ignored_reason);
        if (raw.isError || value.error || value.recovery || (value.commit_status && value.commit_status!=='committed') || !complete) {
          await read('reconcile-save');
          throw Error('PAGE_EDIT_REQUIRES_REVIEW');
        }
      };
      const first = await read('current');
      const plan = await io.plan(i,first);
      await apply(plan);
      const saved = await read('saved');
      const confirmed = await io.confirm(i,saved,plan);
      await apply(confirmed);
      readbacks.push(await read('final'));
      plans.push(confirmed);
    }
    return await io.finish(attempt,plans,readbacks);
  } catch(error) {
    const diagnostic = /^[A-Z_]+$/.test(error.message) ? error.message : 'REPORTING_FLOW_STOPPED';
    if (attempt) {
      try { await io.fail(attempt,diagnostic); } catch { /* pending attempt remains durable */ }
    }
    return {state:'pending',error:diagnostic,sweepResultUnchanged:true};
  }
}
