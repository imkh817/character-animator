import type { SceneDocument } from '@charanim/animation-core';

/**
 * Spring Boot internal API 클라이언트. worker가 아는 외부 세계는
 * 이 API와 presigned URL 두 개뿐이다 (DB, 스토리지 자격증명을 모른다).
 */

const API_URL = process.env.API_URL ?? 'http://localhost:8080';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? 'local-dev-internal-token';

export type OutputFormat = 'MP4' | 'WEBM' | 'GIF';

export interface ClaimedJob {
  jobId: string;
  projectId: string;
  outputFormat: OutputFormat;
  sceneSnapshot: SceneDocument;
  assets: { assetId: string; downloadUrl: string }[];
  outputUploadUrl: string;
}

const HEADERS = {
  'X-Internal-Token': INTERNAL_TOKEN,
  'Content-Type': 'application/json',
};

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => '');
    throw new Error(`API ${method} ${path} failed: ${response.status} ${text}`);
  }
  return response;
}

export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  const response = await request('POST', '/internal/render-jobs/claim', { workerId });
  if (response.status === 204) return null;
  return (await response.json()) as ClaimedJob;
}

export async function reportProgress(jobId: string, progress: number): Promise<void> {
  await request('PATCH', `/internal/render-jobs/${jobId}/progress`, { progress });
}

export async function reportComplete(jobId: string): Promise<void> {
  await request('POST', `/internal/render-jobs/${jobId}/complete`);
}

export async function reportFail(jobId: string, errorMessage: string): Promise<void> {
  await request('POST', `/internal/render-jobs/${jobId}/fail`, { errorMessage });
}
