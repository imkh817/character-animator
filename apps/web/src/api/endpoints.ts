import type { SceneDocument } from '@charanim/animation-core';
import { api, setAccessToken } from './client';
import type {
  AssetResponse,
  AuthResponse,
  OutputFormat,
  PageResponse,
  ProjectDetail,
  ProjectSummary,
  RegisterAssetResponse,
  RenderJobResponse,
  UserSummary,
} from './types';

// ── Auth ─────────────────────────────────────────────────

export async function signup(email: string, password: string, nickname: string): Promise<UserSummary> {
  return api<UserSummary>('POST', '/api/v1/auth/signup', { email, password, nickname });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const result = await api<AuthResponse>('POST', '/api/v1/auth/login', { email, password });
  setAccessToken(result.accessToken);
  return result;
}

export async function logout(): Promise<void> {
  await api<void>('POST', '/api/v1/auth/logout');
  setAccessToken(null);
}

// ── Projects ─────────────────────────────────────────────

export async function listProjects(): Promise<PageResponse<ProjectSummary>> {
  return api('GET', '/api/v1/projects?page=0&size=50');
}

export async function createProject(title: string): Promise<ProjectDetail> {
  return api('POST', '/api/v1/projects', { title });
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  return api('GET', `/api/v1/projects/${projectId}`);
}

export async function deleteProject(projectId: string): Promise<void> {
  return api('DELETE', `/api/v1/projects/${projectId}`);
}

export async function saveScene(
  projectId: string,
  baseVersion: number,
  document: SceneDocument,
): Promise<{ version: number }> {
  return api('PUT', `/api/v1/projects/${projectId}/scene`, { baseVersion, document });
}

// ── Assets ───────────────────────────────────────────────

export async function listAssets(projectId: string): Promise<AssetResponse[]> {
  return api('GET', `/api/v1/projects/${projectId}/assets`);
}

/** 2단계 업로드: 등록 → presigned PUT으로 스토리지에 직접 업로드 → complete */
export async function uploadAsset(projectId: string, file: File): Promise<AssetResponse> {
  const contentType = file.type || 'application/octet-stream';
  const registered = await api<RegisterAssetResponse>('POST', `/api/v1/projects/${projectId}/assets`, {
    filename: file.name,
    contentType,
    sizeBytes: file.size,
  });
  const upload = await fetch(registered.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!upload.ok) {
    throw new Error('스토리지 업로드에 실패했습니다.');
  }
  return api<AssetResponse>('POST', `/api/v1/assets/${registered.id}/complete`);
}

export async function deleteAsset(assetId: string): Promise<void> {
  return api('DELETE', `/api/v1/assets/${assetId}`);
}

// ── Render ───────────────────────────────────────────────

export async function requestRender(projectId: string, format: OutputFormat): Promise<RenderJobResponse> {
  return api('POST', `/api/v1/projects/${projectId}/render-jobs`, { format });
}

export async function getRenderJob(jobId: string): Promise<RenderJobResponse> {
  return api('GET', `/api/v1/render-jobs/${jobId}`);
}

export async function listRenderJobs(projectId: string): Promise<RenderJobResponse[]> {
  return api('GET', `/api/v1/projects/${projectId}/render-jobs`);
}
