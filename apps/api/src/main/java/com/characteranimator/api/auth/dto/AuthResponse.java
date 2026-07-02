package com.characteranimator.api.auth.dto;

import com.characteranimator.api.auth.AuthService.AuthResult;

import java.util.UUID;

public record AuthResponse(String accessToken, UserSummary user) {

    public record UserSummary(UUID id, String email, String nickname) {
    }

    public static AuthResponse from(AuthResult result) {
        return new AuthResponse(result.accessToken(),
                new UserSummary(result.userId(), result.email(), result.nickname()));
    }
}
