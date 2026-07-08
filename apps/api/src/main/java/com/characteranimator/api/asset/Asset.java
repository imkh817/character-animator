package com.characteranimator.api.asset;

import com.characteranimator.api.common.entity.BaseEntity;
import com.github.f4b6a3.uuid.UuidCreator;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "assets")
public class Asset extends BaseEntity {

    public enum Status {
        /** presigned URL 발급됨. 아직 스토리지에 업로드가 검증되지 않음 */
        PENDING,
        /** 업로드 검증 완료. Scene에서 참조 가능 */
        READY
    }

    @Column(nullable = false)
    private UUID projectId;

    @Column(nullable = false)
    private String originalFilename;

    @Column(nullable = false, unique = true, length = 512)
    private String objectKey;

    @Column(nullable = false, length = 100)
    private String contentType;

    @Column(nullable = false)
    private long sizeBytes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    protected Asset() {
    }

    private Asset(UUID id, UUID projectId, String originalFilename, String contentType,
                  String extension, long sizeBytes) {
        super(id);
        this.projectId = projectId;
        this.originalFilename = originalFilename;
        // object key는 클라이언트가 아닌 서버가 결정한다 (경로 조작 방지). 확장자도 contentType에서 유도
        this.objectKey = "projects/%s/assets/%s.%s".formatted(projectId, id, extension);
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.status = Status.PENDING;
    }

    public static Asset register(UUID projectId, String originalFilename, String contentType,
                                 String extension, long declaredSizeBytes) {
        return new Asset(UuidCreator.getTimeOrderedEpoch(), projectId, originalFilename,
                contentType, extension, declaredSizeBytes);
    }

    /** 스토리지에서 확인한 실제 크기로 갱신하며 READY로 전환한다. */
    public void markReady(long actualSizeBytes) {
        if (this.status != Status.PENDING) {
            throw new IllegalStateException("PENDING 상태의 asset만 READY로 전환할 수 있습니다: " + getId());
        }
        this.sizeBytes = actualSizeBytes;
        this.status = Status.READY;
    }

    public boolean isReady() {
        return status == Status.READY;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getObjectKey() {
        return objectKey;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public Status getStatus() {
        return status;
    }
}
