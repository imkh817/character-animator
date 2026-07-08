import os from 'node:os';
import { claimJob, reportComplete, reportFail } from './api';
import { ensureBundle, renderJob } from './render';

const WORKER_ID = process.env.WORKER_ID ?? `${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 3000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const serveUrl = await ensureBundle();
  console.log(`[worker] ${WORKER_ID} polling every ${POLL_INTERVAL_MS}ms`);

  // 큐(pull) 모델: 이 프로세스를 여러 개 띄우는 것이 곧 렌더 서버 증설이다
  for (;;) {
    let job;
    try {
      job = await claimJob(WORKER_ID);
    } catch (e) {
      console.warn(`[worker] claim failed (API down?): ${e}`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    console.log(`[worker] rendering job ${job.jobId} (${job.outputFormat})`);
    try {
      await renderJob(serveUrl, job);
      await reportComplete(job.jobId);
      console.log(`[worker] job ${job.jobId} completed`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[worker] job ${job.jobId} failed: ${message}`);
      // 재시도 여부는 서버(도메인)가 판단한다
      await reportFail(job.jobId, message.slice(0, 2000)).catch((reportError) =>
        console.error(`[worker] fail report also failed: ${reportError}`),
      );
    }
  }
}

main().catch((e) => {
  console.error('[worker] fatal:', e);
  process.exit(1);
});
