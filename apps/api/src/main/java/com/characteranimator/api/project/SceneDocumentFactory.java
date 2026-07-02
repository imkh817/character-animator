package com.characteranimator.api.project;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

/**
 * Scene 문서의 내용은 프론트엔드/렌더 워커(animation-core)가 소유한다.
 * 서버는 새 프로젝트의 초기 문서 생성과 최소한의 형식 검증만 담당한다.
 */
@Component
public class SceneDocumentFactory {

    public static final int CURRENT_SCHEMA_VERSION = 1;

    private final ObjectMapper objectMapper;

    public SceneDocumentFactory(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ObjectNode createInitialDocument() {
        ObjectNode settings = objectMapper.createObjectNode()
                .put("width", 1080)
                .put("height", 1080)
                .put("fps", 30)
                .put("durationInFrames", 150)
                .put("backgroundColor", "#ffffff");

        ObjectNode document = objectMapper.createObjectNode();
        document.put("schemaVersion", CURRENT_SCHEMA_VERSION);
        document.set("settings", settings);
        document.set("nodes", objectMapper.createArrayNode());
        document.set("animations", objectMapper.createObjectNode());
        return document;
    }

    public boolean isValid(com.fasterxml.jackson.databind.JsonNode document) {
        return document != null
                && document.isObject()
                && document.path("schemaVersion").isInt()
                && document.path("settings").isObject()
                && document.path("nodes").isArray()
                && document.path("animations").isObject();
    }
}
