import React, { useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { deleteAsset, listAssets, uploadAsset } from '../api/endpoints';
import type { AssetResponse } from '../api/types';
import { useEditorStore } from '../stores/editorStore';
import { getFileImageSize, getUrlImageSize } from './svgSize';

export const AssetsPanel: React.FC = () => {
  const projectId = useEditorStore((s) => s.projectId)!;
  const assets = useEditorStore((s) => s.assets);
  const addNodeFromAsset = useEditorStore((s) => s.addNodeFromAsset);
  const addBackgroundFromAsset = useEditorStore((s) => s.addBackgroundFromAsset);
  const setAssets = useEditorStore((s) => s.setAssets);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const size = await getFileImageSize(file);
        const uploaded = await uploadAsset(projectId, file);
        // SVG는 캐릭터 파츠로, 사진(래스터)은 배경으로 — 올린 의도에 맞는 기본 동작
        if (file.type === 'image/svg+xml') {
          addNodeFromAsset(uploaded, size);
        } else {
          addBackgroundFromAsset(uploaded, size);
        }
      }
      setAssets(await listAssets(projectId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addAs = async (asset: AssetResponse, mode: 'part' | 'background') => {
    if (!asset.downloadUrl) return;
    const size = await getUrlImageSize(asset.downloadUrl, asset.contentType);
    if (mode === 'part') addNodeFromAsset(asset, size);
    else addBackgroundFromAsset(asset, size);
  };

  const onDelete = async (assetId: string) => {
    setError(null);
    try {
      await deleteAsset(assetId);
      setAssets(await listAssets(projectId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '삭제에 실패했습니다.');
    }
  };

  return (
    <div className="panel-section">
      <div className="panel-section-head">
        <span className="panel-label">파츠 · 이미지</span>
        <button className="icon-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? '…' : '+ 업로드'}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => void onFiles(e.target.files)}
      />
      {error && <div className="error-text">{error}</div>}
      {assets.length === 0 && (
        <div className="empty-hint">
          캐릭터 파츠(SVG)나 배경 사진(PNG/JPG)을
          <br />
          업로드하세요. 캔버스에 바로 추가됩니다.
        </div>
      )}
      {assets.map((asset) => (
        <div
          key={asset.id}
          className="asset-row"
          onClick={() => void addAs(asset, asset.contentType === 'image/svg+xml' ? 'part' : 'background')}
          title="클릭: 캔버스에 추가"
        >
          {asset.downloadUrl && <img className="asset-thumb" src={asset.downloadUrl} alt="" />}
          <span className="row-name">{asset.originalFilename}</span>
          <span className="row-actions">
            <button
              className="icon-btn"
              title="파츠로 추가"
              onClick={(e) => {
                e.stopPropagation();
                void addAs(asset, 'part');
              }}
            >
              +
            </button>
            <button
              className="icon-btn"
              title="배경으로 추가 (캔버스 가득, 맨 아래)"
              onClick={(e) => {
                e.stopPropagation();
                void addAs(asset, 'background');
              }}
            >
              🖼
            </button>
            <button
              className="icon-btn"
              title="파일 삭제"
              onClick={(e) => {
                e.stopPropagation();
                void onDelete(asset.id);
              }}
            >
              ✕
            </button>
          </span>
        </div>
      ))}
    </div>
  );
};
