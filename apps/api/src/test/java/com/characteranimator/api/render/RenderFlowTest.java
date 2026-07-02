package com.characteranimator.api.render;

import com.characteranimator.api.support.TestcontainersConfiguration;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
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

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 렌더 파이프라인 전체 검증. 실제 worker 없이 internal API 호출로 worker를 시뮬레이션한다:
 * 요청 → claim(SKIP LOCKED) → 진행률 → 결과물 업로드 → 완료 / 실패·재시도.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RenderFlowTest {

    private static final String INTERNAL_TOKEN = "local-dev-internal-token";
    private static final byte[] FAKE_MP4 = "fake-mp4-bytes".getBytes();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    private String accessToken;
    private String projectId;
    private String jobId;
    private String outputUploadUrl;

    @BeforeAll
    void setUpUserAndProject() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"render-tester@example.com\",\"password\":\"password123\",\"nickname\":\"렌더테스터\"}"))
                .andExpect(status().isCreated());

        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"render-tester@example.com\",\"password\":\"password123\"}"))
                .andReturn();
        accessToken = objectMapper.readTree(login.getResponse().getContentAsString())
                .path("accessToken").asText();

        MvcResult project = mockMvc.perform(post("/api/v1/projects")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"렌더 테스트\"}"))
                .andReturn();
        projectId = objectMapper.readTree(project.getResponse().getContentAsString())
                .path("id").asText();
    }

    @Test
    @Order(1)
    @DisplayName("렌더를 요청하면 PENDING job이 생기고, 중복 요청은 409를 받는다")
    void requestRender() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/projects/{id}/render-jobs", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"format\":\"MP4\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.outputFormat").value("MP4"))
                .andReturn();
        jobId = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("id").asText();

        mockMvc.perform(post("/api/v1/projects/{id}/render-jobs", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"format\":\"MP4\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RENDER_ALREADY_IN_PROGRESS"));
    }

    @Test
    @Order(2)
    @DisplayName("internal 토큰 없이 claim하면 401, 올바른 토큰이면 렌더에 필요한 모든 것을 받는다")
    void claim() throws Exception {
        mockMvc.perform(post("/internal/render-jobs/claim")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workerId\":\"worker-1\"}"))
                .andExpect(status().isUnauthorized());

        MvcResult result = mockMvc.perform(post("/internal/render-jobs/claim")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workerId\":\"worker-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value(jobId))
                .andExpect(jsonPath("$.sceneSnapshot.schemaVersion").value(1))
                .andExpect(jsonPath("$.outputUploadUrl").isNotEmpty())
                .andReturn();
        outputUploadUrl = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("outputUploadUrl").asText();

        // 큐가 비었으므로 두 번째 claim은 204
        mockMvc.perform(post("/internal/render-jobs/claim")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workerId\":\"worker-2\"}"))
                .andExpect(status().isNoContent());
    }

    @Test
    @Order(3)
    @DisplayName("worker의 진행률 보고가 사용자 폴링에 반영된다")
    void progress() throws Exception {
        mockMvc.perform(patch("/internal/render-jobs/{id}/progress", jobId)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"progress\":55}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/render-jobs/{id}", jobId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PROCESSING"))
                .andExpect(jsonPath("$.progress").value(55))
                .andExpect(jsonPath("$.downloadUrl").isEmpty());
    }

    @Test
    @Order(4)
    @DisplayName("결과물 업로드 전에 complete하면 409를 받는다")
    void completeWithoutOutputRejected() throws Exception {
        mockMvc.perform(post("/internal/render-jobs/{id}/complete", jobId)
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RENDER_OUTPUT_MISSING"));
    }

    @Test
    @Order(5)
    @DisplayName("결과물 업로드 후 complete하면 사용자가 다운로드할 수 있다")
    void uploadAndComplete() throws Exception {
        HttpResponse<String> upload = httpClient.send(
                HttpRequest.newBuilder(URI.create(outputUploadUrl))
                        .header("Content-Type", "video/mp4")
                        .PUT(HttpRequest.BodyPublishers.ofByteArray(FAKE_MP4))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(upload.statusCode()).isEqualTo(200);

        mockMvc.perform(post("/internal/render-jobs/{id}/complete", jobId)
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isNoContent());

        MvcResult result = mockMvc.perform(get("/api/v1/render-jobs/{id}", jobId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.progress").value(100))
                .andExpect(jsonPath("$.downloadUrl").isNotEmpty())
                .andReturn();

        String downloadUrl = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("downloadUrl").asText();
        HttpResponse<byte[]> download = httpClient.send(
                HttpRequest.newBuilder(URI.create(downloadUrl)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
        assertThat(download.statusCode()).isEqualTo(200);
        assertThat(download.body()).isEqualTo(FAKE_MP4);
    }

    @Test
    @Order(6)
    @DisplayName("실패는 재시도(PENDING 복귀)를 거쳐 최대 시도 후 FAILED로 확정된다")
    void failAndRetry() throws Exception {
        // 이전 job이 COMPLETED이므로 새 렌더 요청 가능
        MvcResult result = mockMvc.perform(post("/api/v1/projects/{id}/render-jobs", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"format\":\"WEBM\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String retryJobId = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("id").asText();

        // max-attempts = 3: 두 번은 PENDING으로 복귀, 세 번째에 FAILED 확정
        for (int attempt = 1; attempt <= 3; attempt++) {
            mockMvc.perform(post("/internal/render-jobs/claim")
                            .header("X-Internal-Token", INTERNAL_TOKEN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"workerId\":\"worker-1\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.jobId").value(retryJobId));

            mockMvc.perform(post("/internal/render-jobs/{id}/fail", retryJobId)
                            .header("X-Internal-Token", INTERNAL_TOKEN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"errorMessage\":\"crash %d\"}".formatted(attempt)))
                    .andExpect(status().isNoContent());

            String expectedStatus = attempt < 3 ? "PENDING" : "FAILED";
            mockMvc.perform(get("/api/v1/render-jobs/{id}", retryJobId)
                            .header("Authorization", "Bearer " + accessToken))
                    .andExpect(jsonPath("$.status").value(expectedStatus))
                    .andExpect(jsonPath("$.errorMessage").value("crash " + attempt));
        }

        // FAILED 확정 후에는 큐에 없다
        mockMvc.perform(post("/internal/render-jobs/claim")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workerId\":\"worker-1\"}"))
                .andExpect(status().isNoContent());
    }

    @Test
    @Order(7)
    @DisplayName("렌더 이력이 최신순으로 조회된다")
    void history() throws Exception {
        mockMvc.perform(get("/api/v1/projects/{id}/render-jobs", projectId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].status").value("FAILED"))
                .andExpect(jsonPath("$[1].status").value("COMPLETED"));
    }
}
