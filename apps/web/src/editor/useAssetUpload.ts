import { useState } from 'react';
import { ApiError } from '../api/client';
import { listAssets, uploadAsset } from '../api/endpoints';
import { useEditorStore } from '../stores/editorStore';
import { getFileImageSize } from './svgSize';

const ACCEPTED_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']);

/**
 * 파일 업로드 → 캔버스에 노드로 추가까지의 공통 흐름.
 * 업로드 버튼(AssetsPanel)과 드래그&드롭(CanvasPanel)이 같이 쓴다.
 * 업로드한 이미지는 항상 일반 노드로 추가된다 — 배경으로 깔고 싶으면
 * 에셋 목록의 🖼 버튼으로 명시적으로 추가한다.
 */
export function useAssetUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = async (
    files: FileList | File[] | null,
    position?: { x: number; y: number },
  ): Promise<void> => {
    const accepted = Array.from(files ?? []).filter((f) => ACCEPTED_TYPES.has(f.type));
    if (accepted.length === 0) {
      if (files && files.length > 0) setError('SVG/PNG/JPG/WebP 이미지만 업로드할 수 있습니다.');
      return;
    }
    const store = useEditorStore.getState();
    const projectId = store.projectId;
    if (!projectId) return;

    setError(null);
    setUploading(true);
    try {
      for (const file of accepted) {
        const size = await getFileImageSize(file);
        const uploaded = await uploadAsset(projectId, file);
        useEditorStore.getState().addNodeFromAsset(uploaded, size, position);
      }
      useEditorStore.getState().setAssets(await listAssets(projectId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return { uploading, error, setError, uploadFiles };
}
