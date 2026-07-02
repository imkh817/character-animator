package com.characteranimator.api.auth;

import com.characteranimator.api.common.entity.BaseEntity;
import com.github.f4b6a3.uuid.UuidCreator;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * 토큰 원문은 저장하지 않고 SHA-256 해시만 저장한다. DB가 유출되어도 세션 탈취가 불가능하다.
 */
@Entity
@Table(name = "refresh_tokens")
public class RefreshToken extends BaseEntity {

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(nullable = false)
    private Instant expiresAt;

    protected RefreshToken() {
    }

    private RefreshToken(UUID userId, String tokenHash, Instant expiresAt) {
        super(UuidCreator.getTimeOrderedEpoch());
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public static RefreshToken issue(UUID userId, String tokenHash, Duration ttl) {
        return new RefreshToken(userId, tokenHash, Instant.now().plus(ttl));
    }

    public boolean isExpired() {
        return Instant.now().isAfter(expiresAt);
    }

    public UUID getUserId() {
        return userId;
    }
}
