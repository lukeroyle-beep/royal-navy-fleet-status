import { fileURLToPath } from 'node:url';
import { readReportingFile } from './lib/reporting-files.mjs';
import { renderNativeReportingCell } from './lib/native-reporting-cell.mjs';
try {
  const file=process.argv.find(x=>x.startsWith('--config='))?.slice(9);
  process.stdout.write(renderNativeReportingCell(readReportingFile(file),fileURLToPath(new URL('..',import.meta.url))));
} catch { console.error('REVIEWED_REPORTING_CONFIG_REQUIRED'); process.exitCode=1; }
