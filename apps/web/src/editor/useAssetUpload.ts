import type { NodeOutline } from '@charanim/animation-core';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { listAssets, uploadAsset } from '../api/endpoints';
import { useEditorStore } from '../stores/editorStore';
import { getFileImageSize } from './svgSize';
import { isOutlineEnabled, isTraceEnabled, isTraceable, traceFileToSvg } from './traceSvg';

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
        let toUpload = file;
        let outline: NodeOutline | undefined;
        // PNG/WebP는 벡터 SVG로 트레이싱해서 올린다 (토글로 끌 수 있음). 실패하면 원본 그대로
        if (isTraceEnabled() && isTraceable(file)) {
          try {
            const traced = await traceFileToSvg(file);
            toUpload = traced.file;
            outline = {
              paths: traced.silhouette.paths,
              strokeWidth: traced.silhouette.strokeWidth,
              // 토글이 꺼져 있어도 패스는 저장한다 — 나중에 속성 패널에서 켤 수 있게
              style: isOutlineEnabled() ? 'dashed' : 'none',
            };
          } catch {
            toUpload = file;
          }
        }
        const size = await getFileImageSize(toUpload);
        const uploaded = await uploadAsset(projectId, toUpload);
        useEditorStore.getState().addNodeFromAsset(uploaded, size, position, outline);
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
