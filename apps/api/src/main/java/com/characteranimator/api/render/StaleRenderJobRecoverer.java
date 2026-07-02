package com.characteranimator.api.render;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * worker가 죽으면 fail 보고가 영영 오지 않는다. PROCESSING인데 heartbeat(progress 갱신)가
 * 오래 끊긴 job을 실패 처리해 회수한다 — 시도 횟수가 남았으면 도메인 규칙에 따라 PENDING으로
 * 복귀해 다른 worker가 이어받는다.
 */
@Component
public class StaleRenderJobRecoverer {

    private static final Logger log = LoggerFactory.getLogger(StaleRenderJobRecoverer.class);
    private static final Duration HEARTBEAT_TIMEOUT = Duration.ofMinutes(5);

    private final RenderJobRepository renderJobRepository;

    public StaleRenderJobRecoverer(RenderJobRepository renderJobRepository) {
        this.renderJobRepository = renderJobRepository;
    }

    @Scheduled(fixedDelayString = "PT1M")
    @Transactional
    public void recover() {
        Instant threshold = Instant.now().minus(HEARTBEAT_TIMEOUT);
        List<RenderJob> staleJobs = renderJobRepository
                .findAllByStatusAndLastHeartbeatAtBefore(RenderJob.Status.PROCESSING, threshold);
        for (RenderJob job : staleJobs) {
            log.warn("Recovering stale render job {} (worker: {}, attempt: {})",
                    job.getId(), job.getWorkerId(), job.getAttemptCount());
            job.fail("렌더 서버가 응답하지 않아 작업이 중단되었습니다.");
        }
    }
}
