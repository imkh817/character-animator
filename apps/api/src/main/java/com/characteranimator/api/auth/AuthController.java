package com.characteranimator.api.auth;

import com.characteranimator.api.auth.AuthService.AuthResult;
import com.characteranimator.api.auth.dto.AuthResponse;
import com.characteranimator.api.auth.dto.LoginRequest;
import com.characteranimator.api.auth.dto.SignupRequest;
import com.characteranimator.api.common.config.AppProperties;
import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.characteranimator.api.user.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    static final String REFRESH_TOKEN_COOKIE = "refresh_token";
    private static final String REFRESH_TOKEN_COOKIE_PATH = "/api/v1/auth";

    private final AuthService authService;
    private final AppProperties properties;

    public AuthController(AuthService authService, AppProperties properties) {
        this.authService = authService;
        this.properties = properties;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse.UserSummary> signup(@Valid @RequestBody SignupRequest request) {
        User user = authService.signUp(request.email(), request.password(), request.nickname());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new AuthResponse.UserSummary(user.getId(), user.getEmail(), user.getNickname()));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResult result = authService.login(request.email(), request.password());
        return withRefreshCookie(result, AuthResponse.from(result));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @CookieValue(name = REFRESH_TOKEN_COOKIE, required = false) String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ApiException(ErrorCode.INVALID_REFRESH_TOKEN);
        }
        AuthResult result = authService.refresh(refreshToken);
        return withRefreshCookie(result, AuthResponse.from(result));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = REFRESH_TOKEN_COOKIE, required = false) String refreshToken) {
        authService.logout(refreshToken);
        ResponseCookie expired = refreshCookieBuilder("").maxAge(Duration.ZERO).build();
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, expired.toString())
                .build();
    }

    private <T> ResponseEntity<T> withRefreshCookie(AuthResult result, T body) {
        ResponseCookie cookie = refreshCookieBuilder(result.refreshToken())
                .maxAge(properties.jwt().refreshTokenTtl())
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(body);
    }

    private ResponseCookie.ResponseCookieBuilder refreshCookieBuilder(String value) {
        return ResponseCookie.from(REFRESH_TOKEN_COOKIE, value)
                .httpOnly(true)
                .secure(properties.auth().cookieSecure())
                .path(REFRESH_TOKEN_COOKIE_PATH)
                .sameSite("Strict");
    }
}
