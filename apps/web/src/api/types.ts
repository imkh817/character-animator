import type { SceneDocument } from '@charanim/animation-core';

// 서버 DTO 미러. 서버 응답 구조가 바뀌면 이 파일만 고치면 된다.

export interface UserSummary {
  id: string;
  email: string;
  nickname: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserSummary;
}

export interface ProjectSummary {
  id: string;
  title: string;
  thumbnailKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail {
  id: string;
  title: string;
  sceneVersion: number;
  sceneDocument: SceneDocument;
  thumbnailKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface RegisterAssetResponse {
  id: string;
  objectKey: string;
  uploadUrl: string;
  status: string;
}

export interface AssetResponse {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  status: 'PENDING' | 'READY';
  downloadUrl: string | null;
  createdAt: string;
}

export type OutputFormat = 'MP4' | 'WEBM' | 'GIF';

export type RenderStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface RenderJobResponse {
  id: string;
  projectId: string;
  status: RenderStatus;
  outputFormat: OutputFormat;
  progress: number;
  errorMessage: string | null;
  downloadUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}
