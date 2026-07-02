package com.characteranimator.api.project;

import com.characteranimator.api.common.entity.BaseEntity;
import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.github.f4b6a3.uuid.UuidCreator;
import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Type;

import java.util.UUID;

@Entity
@Table(name = "projects")
public class Project extends BaseEntity {

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 100)
    private String title;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb", nullable = false)
    private JsonNode sceneDocument;

    @Column(nullable = false)
    private long sceneVersion;

    @Column(length = 512)
    private String thumbnailKey;

    protected Project() {
    }

    private Project(UUID userId, String title, JsonNode sceneDocument) {
        super(UuidCreator.getTimeOrderedEpoch());
        this.userId = userId;
        this.title = title;
        this.sceneDocument = sceneDocument;
        this.sceneVersion = 0L;
    }

    public static Project create(UUID userId, String title, JsonNode initialScene) {
        return new Project(userId, title, initialScene);
    }

    /**
     * 낙관적 락: 클라이언트가 마지막으로 알고 있던 버전(baseVersion)과 현재 버전이 다르면
     * 다른 세션이 먼저 저장한 것이므로 덮어쓰지 않고 충돌을 알린다.
     */
    public long updateScene(long baseVersion, JsonNode document) {
        if (this.sceneVersion != baseVersion) {
            throw new ApiException(ErrorCode.SCENE_VERSION_CONFLICT);
        }
        this.sceneDocument = document;
        this.sceneVersion++;
        return this.sceneVersion;
    }

    public void rename(String title) {
        this.title = title;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getTitle() {
        return title;
    }

    public JsonNode getSceneDocument() {
        return sceneDocument;
    }

    public long getSceneVersion() {
        return sceneVersion;
    }

    public String getThumbnailKey() {
        return thumbnailKey;
    }
}
