package com.characteranimator.api.common.storage;

import java.net.URL;
import java.time.Duration;
import java.util.Collection;
import java.util.Optional;

/**
 * Object Storage 추상화. 구현체는 S3 호환 API 하나로 통일하며(MinIO/S3/R2),
 * 도메인 코드는 특정 스토리지 벤더를 알지 못한다.
 */
public interface StoragePort {

    /** 클라이언트가 직접 업로드할 수 있는 presigned PUT URL을 발급한다. contentType이 서명에 포함된다. */
    URL issueUploadUrl(String objectKey, String contentType, Duration ttl);

    /** 클라이언트가 직접 다운로드할 수 있는 presigned GET URL을 발급한다. */
    URL issueDownloadUrl(String objectKey, Duration ttl);

    /** 오브젝트가 존재하면 메타데이터를 반환한다. 업로드 완료 검증에 사용한다. */
    Optional<ObjectMetadata> head(String objectKey);

    void delete(String objectKey);

    void deleteAll(Collection<String> objectKeys);

    record ObjectMetadata(long sizeBytes, String contentType) {
    }
}
