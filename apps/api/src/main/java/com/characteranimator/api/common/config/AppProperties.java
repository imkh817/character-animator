package com.characteranimator.api.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Auth auth, Cors cors, Storage storage, Asset asset,
                            Render render, Internal internal) {

    public record Jwt(String secret, Duration accessTokenTtl, Duration refreshTokenTtl) {
    }

    public record Auth(boolean cookieSecure) {
    }

    public record Cors(List<String> allowedOrigins) {
    }

    public record Storage(
            String endpoint,
            String region,
            String accessKey,
            String secretKey,
            String bucket,
            boolean autoCreateBucket,
            Duration uploadUrlTtl,
            Duration downloadUrlTtl
    ) {
    }

    public record Asset(long maxSizeBytes) {
    }

    public record Render(int maxAttempts) {
    }

    public record Internal(String token) {
    }
}
