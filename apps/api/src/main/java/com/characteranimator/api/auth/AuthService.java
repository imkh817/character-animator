package com.characteranimator.api.auth;

import com.characteranimator.api.common.config.AppProperties;
import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.characteranimator.api.user.User;
import com.characteranimator.api.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class AuthService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties properties;

    public AuthService(UserRepository userRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       JwtTokenProvider jwtTokenProvider,
                       PasswordEncoder passwordEncoder,
                       AppProperties properties) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
    }

    public record AuthResult(UUID userId, String email, String nickname,
                             String accessToken, String refreshToken) {
    }

    @Transactional
    public User signUp(String email, String rawPassword, String nickname) {
        if (userRepository.existsByEmail(email)) {
            throw new ApiException(ErrorCode.DUPLICATE_EMAIL);
        }
        return userRepository.save(User.signUp(email, passwordEncoder.encode(rawPassword), nickname));
    }

    @Transactional
    public AuthResult login(String email, String rawPassword) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ApiException(ErrorCode.LOGIN_FAILED));
        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new ApiException(ErrorCode.LOGIN_FAILED);
        }
        return issueTokens(user);
    }

    @Transactional
    public AuthResult refresh(String refreshTokenValue) {
        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash(refreshTokenValue))
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_REFRESH_TOKEN));

        refreshTokenRepository.delete(stored);
        if (stored.isExpired()) {
            throw new ApiException(ErrorCode.INVALID_REFRESH_TOKEN);
        }
        User user = userRepository.findById(stored.getUserId())
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_REFRESH_TOKEN));
        return issueTokens(user);
    }

    @Transactional
    public void logout(String refreshTokenValue) {
        if (refreshTokenValue != null && !refreshTokenValue.isBlank()) {
            refreshTokenRepository.deleteByTokenHash(hash(refreshTokenValue));
        }
    }

    private AuthResult issueTokens(User user) {
        String accessToken = jwtTokenProvider.createAccessToken(user.getId());
        String refreshToken = generateRefreshTokenValue();
        refreshTokenRepository.save(
                RefreshToken.issue(user.getId(), hash(refreshToken), properties.jwt().refreshTokenTtl()));
        return new AuthResult(user.getId(), user.getEmail(), user.getNickname(), accessToken, refreshToken);
    }

    private String generateRefreshTokenValue() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
