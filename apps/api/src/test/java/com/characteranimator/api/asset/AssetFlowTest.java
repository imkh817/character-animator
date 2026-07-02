package com.characteranimator.api.asset;

import com.characteranimator.api.support.TestcontainersConfiguration;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 2단계 업로드 전체 흐름 검증: 등록(presigned URL 발급) → MinIO에 실제 업로드 →
 * 완료 확정 → 목록/다운로드 → 참조 중 삭제 방어 → 삭제.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AssetFlowTest {

    private static final String SVG_BODY = """
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    private String accessToken;
    private String projectId;
    private String assetId;
    private String uploadUrl;

    @BeforeAll
    void setUpUserAndProject() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"asset-tester@example.com\",\"password\":\"password123\",\"nickname\":\"에셋테스터\"}"))
                .andExpect(status().isCreated());

        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"asset-tester@example.com\",\"password\":\"password123\"}"))
                .andExpect(status().isOk())
                .andReturn();
        accessToken = objectMapper.readTree(login.getResponse().getContentAsString())
                .path("accessToken").asText();

        MvcResult project = mockMvc.perform(post("/api/v1/projects")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"에셋 테스트\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        projectId = objectMapper.readTree(project.getResponse().getContentAsString())
                .path("id").asText();
    }

    @Test
    @Order(1)
    @DisplayName("SVG가 아닌 파일은 등록이 거부된다")
    void rejectNonSvg() throws Exception {
        mockMvc.perform(post("/api/v1/projects/{id}/assets", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"filename\":\"photo.png\",\"contentType\":\"image/png\",\"sizeBytes\":1000}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_ASSET_TYPE"));
    }

    @Test
    @Order(2)
    @DisplayName("등록하면 PENDING 상태와 presigned 업로드 URL을 받는다")
    void registerAsset() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/projects/{id}/assets", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"filename\":\"head.svg\",\"contentType\":\"image/svg+xml\",\"sizeBytes\":%d}"
                                .formatted(SVG_BODY.length())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.uploadUrl").isNotEmpty())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assetId = body.path("id").asText();
        uploadUrl = body.path("uploadUrl").asText();
        assertThat(body.path("objectKey").asText())
                .isEqualTo("projects/%s/assets/%s.svg".formatted(projectId, assetId));
    }

    @Test
    @Order(3)
    @DisplayName("업로드 전에 complete를 호출하면 409를 받는다")
    void completeBeforeUploadRejected() throws Exception {
        mockMvc.perform(post("/api/v1/assets/{id}/complete", assetId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ASSET_UPLOAD_INCOMPLETE"));
    }

    @Test
    @Order(4)
    @DisplayName("presigned URL로 직접 업로드한 뒤 complete하면 READY가 된다")
    void uploadAndComplete() throws Exception {
        HttpResponse<String> uploadResponse = httpClient.send(
                HttpRequest.newBuilder(URI.create(uploadUrl))
                        .header("Content-Type", "image/svg+xml")
                        .PUT(HttpRequest.BodyPublishers.ofString(SVG_BODY))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(uploadResponse.statusCode()).isEqualTo(200);

        mockMvc.perform(post("/api/v1/assets/{id}/complete", assetId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.sizeBytes").value(SVG_BODY.getBytes(StandardCharsets.UTF_8).length));

        // 멱등성: 다시 호출해도 성공
        mockMvc.perform(post("/api/v1/assets/{id}/complete", assetId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());
    }

    @Test
    @Order(5)
    @DisplayName("목록에서 다운로드 URL을 받아 실제로 내려받을 수 있다")
    void listAndDownload() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/projects/{id}/assets", projectId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].originalFilename").value("head.svg"))
                .andExpect(jsonPath("$[0].downloadUrl").isNotEmpty())
                .andReturn();

        String downloadUrl = objectMapper.readTree(result.getResponse().getContentAsString())
                .get(0).path("downloadUrl").asText();

        HttpResponse<String> download = httpClient.send(
                HttpRequest.newBuilder(URI.create(downloadUrl)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(download.statusCode()).isEqualTo(200);
        assertThat(download.body()).isEqualTo(SVG_BODY);
    }

    @Test
    @Order(6)
    @DisplayName("Scene에서 참조 중인 asset은 삭제할 수 없다")
    void deleteReferencedAssetRejected() throws Exception {
        // asset을 참조하는 노드를 Scene에 추가
        JsonNode detail = objectMapper.readTree(mockMvc.perform(
                        get("/api/v1/projects/{id}", projectId)
                                .header("Authorization", "Bearer " + accessToken))
                .andReturn().getResponse().getContentAsString());

        ObjectNode document = detail.path("sceneDocument").deepCopy();
        ObjectNode node = objectMapper.createObjectNode()
                .put("id", "node-1")
                .put("name", "머리")
                .put("assetId", assetId);
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.withArray("nodes")).add(node);

        ObjectNode request = objectMapper.createObjectNode();
        request.put("baseVersion", detail.path("sceneVersion").asLong());
        request.set("document", document);

        mockMvc.perform(put("/api/v1/projects/{id}/scene", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request.toString()))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/assets/{id}", assetId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ASSET_IN_USE"));
    }

    @Test
    @Order(7)
    @DisplayName("참조를 제거하면 삭제할 수 있고, 스토리지 오브젝트도 사라진다")
    void deleteAfterUnreference() throws Exception {
        JsonNode detail = objectMapper.readTree(mockMvc.perform(
                        get("/api/v1/projects/{id}", projectId)
                                .header("Authorization", "Bearer " + accessToken))
                .andReturn().getResponse().getContentAsString());

        ObjectNode document = detail.path("sceneDocument").deepCopy();
        document.putArray("nodes");
        ObjectNode request = objectMapper.createObjectNode();
        request.put("baseVersion", detail.path("sceneVersion").asLong());
        request.set("document", document);

        mockMvc.perform(put("/api/v1/projects/{id}/scene", projectId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request.toString()))
                .andExpect(status().isOk());

        MvcResult listBefore = mockMvc.perform(get("/api/v1/projects/{id}/assets", projectId)
                        .header("Authorization", "Bearer " + accessToken))
                .andReturn();
        String downloadUrl = objectMapper.readTree(listBefore.getResponse().getContentAsString())
                .get(0).path("downloadUrl").asText();

        mockMvc.perform(delete("/api/v1/assets/{id}", assetId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/projects/{id}/assets", projectId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());

        HttpResponse<String> download = httpClient.send(
                HttpRequest.newBuilder(URI.create(downloadUrl)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(download.statusCode()).isEqualTo(404);
    }
}
