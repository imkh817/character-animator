import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportProgress, type ClaimedJob, type OutputFormat } from './api';

const COMPOSITION_ID = 'CharacterScene';

const FORMAT_CONFIG: Record<OutputFormat, { codec: 'h264' | 'vp8' | 'gif'; extension: string; contentType: string }> = {
  MP4: { codec: 'h264', extension: 'mp4', contentType: 'video/mp4' },
  WEBM: { codec: 'vp8', extension: 'webm', contentType: 'video/webm' },
  GIF: { codec: 'gif', extension: 'gif', contentType: 'image/gif' },
};

let cachedServeUrl: string | null = null;

/** Remotion 번들은 무겁다. worker 시작 시 한 번 만들어 모든 job이 재사용한다. */
export async function ensureBundle(): Promise<string> {
  if (cachedServeUrl) return cachedServeUrl;
  const entryPoint = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'remotion/index.ts');
  console.log('[worker] Bundling Remotion composition...');
  cachedServeUrl = await bundle({ entryPoint });
  console.log('[worker] Bundle ready');
  return cachedServeUrl;
}

export async function renderJob(serveUrl: string, job: ClaimedJob): Promise<void> {
  const format = FORMAT_CONFIG[job.outputFormat];
  const inputProps = {
    document: job.sceneSnapshot,
    assetUrls: Object.fromEntries(job.assets.map((a) => [a.assetId, a.downloadUrl])),
  };

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
  });

  const outputPath = path.join(os.tmpdir(), `charanim-${job.jobId}.${format.extension}`);
  let lastReported = -1;

  try {
    await renderMedia({
      serveUrl,
      composition,
      codec: format.codec,
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress }) => {
        const percent = Math.floor(progress * 100);
        // heartbeat 겸 진행률 보고. API 부하를 줄이기 위해 5%p 단위로 throttle
        if (percent >= lastReported + 5) {
          lastReported = percent;
          reportProgress(job.jobId, percent).catch((e) =>
            console.warn(`[worker] progress report failed: ${e}`),
          );
        }
      },
    });

    const bytes = await fs.readFile(outputPath);
    const upload = await fetch(job.outputUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': format.contentType },
      body: bytes,
    });
    if (!upload.ok) {
      throw new Error(`output upload failed: ${upload.status}`);
    }
  } finally {
    await fs.unlink(outputPath).catch(() => {});
  }
}
