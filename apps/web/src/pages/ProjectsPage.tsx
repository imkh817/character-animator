import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject, deleteProject, listProjects } from '../api/endpoints';
import type { ProjectSummary } from '../api/types';
import { useAuthStore } from '../stores/authStore';

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  const reload = useCallback(async () => {
    const page = await listProjects();
    setProjects(page.content);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = async () => {
    const title = window.prompt('프로젝트 이름을 입력하세요', '새 캐릭터');
    if (!title?.trim()) return;
    const project = await createProject(title.trim());
    navigate(`/editor/${project.id}`);
  };

  const onDelete = async (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation();
    if (!window.confirm(`'${project.title}' 프로젝트를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await deleteProject(project.id);
    await reload();
  };

  return (
    <div className="atelier">
      <div className="projects-page">
        <div className="projects-topbar">
          <div className="logotype">
            CHAR<span className="tick">◆</span>ANIM
          </div>
          <button className="btn btn--ghost" onClick={() => void logout()}>
            로그아웃
          </button>
        </div>
        <h1 className="projects-title">프로젝트</h1>
        <div className="project-grid">
          <button className="project-card project-card--new" onClick={() => void onCreate()}>
            + 새 프로젝트
          </button>
          {projects?.map((p) => (
            <button key={p.id} className="project-card" onClick={() => navigate(`/editor/${p.id}`)}>
              <div className="name">{p.title}</div>
              <div className="meta">수정 {new Date(p.updatedAt).toLocaleString('ko-KR')}</div>
              <span className="delete icon-btn" onClick={(e) => void onDelete(e, p)}>
                ✕
              </span>
            </button>
          ))}
        </div>
        {projects && projects.length === 0 && (
          <p className="empty-hint" style={{ marginTop: 16 }}>
            아직 프로젝트가 없습니다. 새 프로젝트를 만들고 SVG 파츠를 업로드해 보세요.
          </p>
        )}
      </div>
    </div>
  );
};
