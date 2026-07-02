package com.characteranimator.api.common.security;

import com.characteranimator.api.common.config.AppProperties;
import com.characteranimator.api.common.error.ErrorCode;
import com.characteranimator.api.common.error.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * /internal/** 전용 인증. 렌더 worker는 사용자 JWT 대신 공유 시크릿으로 인증한다.
 */
@Component
public class InternalTokenFilter extends OncePerRequestFilter {

    public static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    private final byte[] expectedToken;
    private final ObjectMapper objectMapper;

    public InternalTokenFilter(AppProperties properties, ObjectMapper objectMapper) {
        this.expectedToken = properties.internal().token().getBytes(StandardCharsets.UTF_8);
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/internal/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String provided = request.getHeader(INTERNAL_TOKEN_HEADER);
        // 타이밍 공격을 막기 위해 상수 시간 비교를 사용한다
        boolean valid = provided != null
                && MessageDigest.isEqual(expectedToken, provided.getBytes(StandardCharsets.UTF_8));
        if (!valid) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            objectMapper.writeValue(response.getWriter(), ErrorResponse.of(ErrorCode.UNAUTHORIZED));
            return;
        }
        filterChain.doFilter(request, response);
    }
}
