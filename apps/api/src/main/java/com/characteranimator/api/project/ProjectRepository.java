package com.characteranimator.api.project;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    Optional<Project> findByIdAndUserId(UUID id, UUID userId);

    /**
     * 목록 화면에는 scene_document(수십 KB JSONB)가 필요 없으므로
     * 프로젝션으로 메타데이터만 조회한다.
     */
    @Query("""
            select p.id as id, p.title as title, p.thumbnailKey as thumbnailKey,
                   p.createdAt as createdAt, p.updatedAt as updatedAt
            from Project p
            where p.userId = :userId
            """)
    Page<ProjectSummary> findSummariesByUserId(@Param("userId") UUID userId, Pageable pageable);

    interface ProjectSummary {
        UUID getId();

        String getTitle();

        String getThumbnailKey();

        Instant getCreatedAt();

        Instant getUpdatedAt();
    }
}
