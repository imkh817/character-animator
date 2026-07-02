package com.characteranimator.api.render;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RenderJobRepository extends JpaRepository<RenderJob, UUID> {

    /**
     * 큐에서 다음 job을 원자적으로 가져온다.
     * FOR UPDATE SKIP LOCKED: 여러 worker가 동시에 claim해도 이미 잠긴 row는 건너뛰므로
     * 같은 job을 두 worker가 가져가는 일이 없다. 반드시 트랜잭션 안에서 호출해야 한다.
     */
    @Query(value = """
            SELECT * FROM render_jobs
            WHERE status = 'PENDING'
            ORDER BY created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    Optional<RenderJob> findNextPendingForUpdate();

    Optional<RenderJob> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByProjectIdAndStatusIn(UUID projectId, Collection<RenderJob.Status> statuses);

    List<RenderJob> findAllByProjectIdOrderByCreatedAtDesc(UUID projectId);

    List<RenderJob> findAllByProjectId(UUID projectId);

    List<RenderJob> findAllByStatusAndLastHeartbeatAtBefore(RenderJob.Status status, Instant threshold);
}
