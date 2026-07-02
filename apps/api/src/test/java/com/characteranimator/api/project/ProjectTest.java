package com.characteranimator.api.project;

import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProjectTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SceneDocumentFactory factory = new SceneDocumentFactory(objectMapper);

    @Test
    @DisplayName("Scene 저장 시 baseVersion이 일치하면 문서를 교체하고 버전을 올린다")
    void updateScene_incrementsVersion() {
        Project project = Project.create(UUID.randomUUID(), "테스트", factory.createInitialDocument());

        long version = project.updateScene(0L, factory.createInitialDocument());

        assertThat(version).isEqualTo(1L);
        assertThat(project.getSceneVersion()).isEqualTo(1L);
    }

    @Test
    @DisplayName("baseVersion이 현재 버전과 다르면 SCENE_VERSION_CONFLICT")
    void updateScene_conflictOnStaleVersion() {
        Project project = Project.create(UUID.randomUUID(), "테스트", factory.createInitialDocument());
        project.updateScene(0L, factory.createInitialDocument());

        assertThatThrownBy(() -> project.updateScene(0L, factory.createInitialDocument()))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.SCENE_VERSION_CONFLICT);
    }

    @Test
    @DisplayName("초기 Scene 문서는 스키마 규칙을 만족한다")
    void initialDocument_isValid() {
        assertThat(factory.isValid(factory.createInitialDocument())).isTrue();
    }

    @Test
    @DisplayName("필수 필드가 없는 문서는 유효하지 않다")
    void invalidDocument_isRejected() {
        assertThat(factory.isValid(objectMapper.createObjectNode())).isFalse();
        assertThat(factory.isValid(null)).isFalse();
    }
}
