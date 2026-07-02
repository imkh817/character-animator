package com.characteranimator.api.project;

import java.util.UUID;

/**
 * 프로젝트 삭제 시 발행. 삭제에 따라 정리가 필요한 다른 도메인(asset, 이후 render job 등)이
 * 이 이벤트를 구독한다. project 도메인이 그들을 직접 알 필요가 없어진다.
 */
public record ProjectDeletedEvent(UUID projectId) {
}
