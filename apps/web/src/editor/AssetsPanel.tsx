import React, { useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { deleteAsset, listAssets } from '../api/endpoints';
import type { AssetResponse } from '../api/types';
import { useEditorStore } from '../stores/editorStore';
import { getUrlImageSize } from './svgSize';
import { useAssetUpload } from './useAssetUpload';

export const AssetsPanel: React.FC = () => {
  const projectId = useEditorStore((s) => s.projectId)!;
  const assets = useEditorStore((s) => s.assets);
  const addNodeFromAsset = useEditorStore((s) => s.addNodeFromAsset);
  const addBackgroundFromAsset = useEditorStore((s) => s.addBackgroundFromAsset);
  const setAssets = useEditorStore((s) => s.setAssets);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, error, setError, uploadFiles } = useAssetUpload();
  const [dragOver, setDragOver] = useState(false);

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
    <div
      className={`panel-section${dragOver ? ' panel-section--dragover' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void uploadFiles(e.dataTransfer.files);
      }}
    >
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
        onChange={(e) => {
          void uploadFiles(e.target.files).finally(() => {
            if (fileInputRef.current) fileInputRef.current.value = '';
          });
        }}
      />
      {error && <div className="error-text">{error}</div>}
      {assets.length === 0 && (
        <div className="empty-hint">
          이미지(SVG/PNG/JPG)를 업로드하거나
          <br />
          캔버스에 드래그해서 놓으세요.
        </div>
      )}
      {assets.map((asset) => (
        <div
          key={asset.id}
          className="asset-row"
          onClick={() => void addAs(asset, 'part')}
          title="클릭: 캔버스에 추가"
        >
          {asset.downloadUrl && <img className="asset-thumb" src={asset.downloadUrl} alt="" />}
          <span className="row-name">{asset.originalFilename}</span>
          <span className="row-actions">
            <button
              className="icon-btn"
              title="캔버스에 추가"
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
