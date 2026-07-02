package com.characteranimator.api.auth;

import com.characteranimator.api.common.config.AppProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JwtTokenProviderTest {

    private static final String SECRET = "test-secret-key-must-be-at-least-32-bytes-long!!";

    private AppProperties properties(Duration accessTtl) {
        return new AppProperties(
                new AppProperties.Jwt(SECRET, accessTtl, Duration.ofDays(14)),
                new AppProperties.Auth(false),
                new AppProperties.Cors(List.of()),
                null,
                null,
                null,
                null);
    }

    @Test
    @DisplayName("발급한 토큰에서 userId를 복원할 수 있다")
    void roundTrip() {
        JwtTokenProvider provider = new JwtTokenProvider(properties(Duration.ofMinutes(30)));
        UUID userId = UUID.randomUUID();

        String token = provider.createAccessToken(userId);

        assertThat(provider.parseUserId(token)).contains(userId);
    }

    @Test
    @DisplayName("만료된 토큰은 거부한다")
    void expiredTokenRejected() {
        JwtTokenProvider provider = new JwtTokenProvider(properties(Duration.ofMinutes(-1)));

        String token = provider.createAccessToken(UUID.randomUUID());

        assertThat(provider.parseUserId(token)).isEmpty();
    }

    @Test
    @DisplayName("위조된 토큰은 거부한다")
    void tamperedTokenRejected() {
        JwtTokenProvider provider = new JwtTokenProvider(properties(Duration.ofMinutes(30)));

        String token = provider.createAccessToken(UUID.randomUUID());

        // 페이로드(두 번째 세그먼트)를 변조하면 서명 검증에 실패해야 한다
        String[] parts = token.split("\\.");
        String tampered = parts[0] + "." + parts[1].substring(1) + "A." + parts[2];

        assertThat(provider.parseUserId(tampered)).isEmpty();
        assertThat(provider.parseUserId("not-a-jwt")).isEmpty();
    }
}
