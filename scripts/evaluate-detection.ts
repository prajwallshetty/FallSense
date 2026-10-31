// Offline accuracy evaluation. Replays labelled recordings through the real sensor and detection
// code and prints metrics. Recordings come from the Calibration screen's "Export all as JSON".
//
//   npx tsx scripts/evaluate-detection.ts recordings.json [thresholds.json]
//
// Results describe only the recordings supplied. They are a claim about accuracy only if the
// recordings are independent and the held-out participants were never used to tune thresholds.
import { readFileSync } from 'node:fs';
import { DEFAULT_DETECTION_CONFIG, sanitizeDetectionConfig } from '../src/detection/config';
import { evaluate, Recording } from '../src/detection/evaluation';

const [recordingsPath, thresholdsPath] = process.argv.slice(2);
if (!recordingsPath) {
  console.error('Usage: tsx scripts/evaluate-detection.ts recordings.json [thresholds.json]');
  process.exit(2);
}

const recordings = JSON.parse(readFileSync(recordingsPath, 'utf8')) as Recording[];
const config = thresholdsPath ? sanitizeDetectionConfig(JSON.parse(readFileSync(thresholdsPath, 'utf8'))) : DEFAULT_DETECTION_CONFIG;
const report = evaluate(recordings, config);

const pct = (v: number | null) => (v === null ? 'no data' : `${(v * 100).toFixed(1)}%`);
const show = (name: string, m: typeof report.overall) =>
  console.log(
    `${name.padEnd(28)} falls ${m.falls} | sensitivity ${pct(m.sensitivity)} | specificity ${pct(m.specificity)} | precision ${pct(m.precision)} | ` +
      `false alarms/h ${m.falseAlarmsPerHour === null ? 'no data' : m.falseAlarmsPerHour.toFixed(2)} | latency ${m.meanLatencyMs === null ? 'no data' : `${(m.meanLatencyMs / 1000).toFixed(1)}s`}`,
  );

console.log(`${recordings.length} recordings`);
for (const w of report.warnings) console.log(`WARNING: ${w}`);
show('all recordings', report.overall);
if (report.heldOut) show(`held out (${report.heldOut.testParticipants.join(',')})`, report.heldOut.metrics);
for (const [k, m] of Object.entries(report.byParticipant)) show(`participant ${k}`, m);
for (const [k, m] of Object.entries(report.byOrientation)) show(`orientation ${k}`, m);
