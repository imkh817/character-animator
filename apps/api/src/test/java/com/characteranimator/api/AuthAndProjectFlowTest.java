package com.characteranimator.api;

import com.characteranimator.api.support.TestcontainersConfiguration;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 회원가입 → 로그인 → 프로젝트 생성 → Scene 저장/충돌 → 토큰 재발급 → 삭제까지의
 * 전체 시나리오를 실제 PostgreSQL(Testcontainers) 위에서 검증한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AuthAndProjectFlowTest {

    private static final String EMAIL = "tester@example.com";
    private static final String PASSWORD = "password123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String accessToken;
    private Cookie refreshCookie;
    private String projectId;

    @Test
    @Order(1)
    @DisplayName("회원가입에 성공하고, 중복 이메일은 409를 받는다")
    void signup() throws Exception {
        String body = """
                {"email":"%s","password":"%s","nickname":"테스터"}
                """.formatted(EMAIL, PASSWORD);

        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(EMAIL));

        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_EMAIL"));
    }

    @Test
    @Order(2)
    @DisplayName("잘못된 비밀번호는 401, 올바른 로그인은 accessToken과 refresh 쿠키를 받는다")
    void login() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"wrong-password\"}".formatted(EMAIL)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("LOGIN_FAILED"));

        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(EMAIL, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(cookie().httpOnly("refresh_token", true))
                .andReturn();

        accessToken = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("accessToken").asText();
        refreshCookie = result.getResponse().getCookie("refresh_token");
        assertThat(refreshCookie).isNotNull();
    }

    @Test
    @Order(3)
    @DisplayName("토큰 없이 프로젝트 API에 접근하면 401을 받는다")
    void unauthorizedWithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/projects"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    @Order(4)
    @DisplayName("프로젝트를 생성하면 초기 Scene 문서(version 0)가 함께 만들어진다")
    void createProject() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/projects")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"내 첫 캐릭터\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("내 첫 캐릭터"))
                .andExpect(jsonPath("$.sceneVersion").value(0))
                .andExpect(jsonPath("$.sceneDocument.schemaVersion").value(1))
                .andExpect(jsonPath("$.sceneDocument.settings.fps").value(30))
                .andReturn();

        projectId = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("id").asText();
    }

    @Test
    @Order(5)
    @DisplayName("Scene 저장은 버전을 올리고, 낡은 baseVersion으로 저장하면 409를 받는다")
    void updateSceneWithOptimisticLock() throws Exception {
        JsonNode detail = objectMapper.readTree(mockMvc.perform(
                        get("/api/v1/projects/{id}", projectId)
                                .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        ObjectNode document = detail.path("sceneDocument").deepCopy();
        document.putObject("animations");
        ObjectNode request = objectMapper.createObjectNode();
        request.put("baseVersion", 0L);
        request.set("document", document);

        mockMvc.perform(put("/api/v1/projects/{id}/scene", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        // 같은 baseVersion(0)으로 다시 저장 → 다른 세션이 먼저 저장한 상황과 동일
        mockMvc.perform(put("/api/v1/projects/{id}/scene", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request.toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SCENE_VERSION_CONFLICT"));
    }

    @Test
    @Order(6)
    @DisplayName("잘못된 형식의 Scene 문서는 400을 받는다")
    void invalidSceneDocumentRejected() throws Exception {
        mockMvc.perform(put("/api/v1/projects/{id}/scene", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":1,\"document\":{\"foo\":\"bar\"}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SCENE_DOCUMENT"));
    }

    @Test
    @Order(7)
    @DisplayName("목록 조회는 scene 문서 없이 메타데이터만 반환한다")
    void listProjects() throws Exception {
        mockMvc.perform(get("/api/v1/projects")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("내 첫 캐릭터"))
                .andExpect(jsonPath("$.content[0].sceneDocument").doesNotExist());
    }

    @Test
    @Order(8)
    @DisplayName("refresh 쿠키로 새 accessToken을 받고, 쿠키는 회전된다")
    void refreshToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn();

        Cookie rotated = result.getResponse().getCookie("refresh_token");
        assertThat(rotated).isNotNull();
        assertThat(rotated.getValue()).isNotEqualTo(refreshCookie.getValue());

        // 사용된(회전 전) 토큰은 더 이상 유효하지 않다
        mockMvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));

        refreshCookie = rotated;
    }

    @Test
    @Order(9)
    @DisplayName("프로젝트 삭제 후에는 404를 받는다")
    void deleteProject() throws Exception {
        mockMvc.perform(delete("/api/v1/projects/{id}", projectId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/projects/{id}", projectId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }
}
