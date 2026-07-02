package com.characteranimator.api.common.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    LOGIN_FAILED(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "다시 로그인해 주세요."),
    DUPLICATE_EMAIL(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다."),
    PROJECT_NOT_FOUND(HttpStatus.NOT_FOUND, "프로젝트를 찾을 수 없습니다."),
    ASSET_NOT_FOUND(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다."),
    UNSUPPORTED_ASSET_TYPE(HttpStatus.BAD_REQUEST, "SVG 파일만 업로드할 수 있습니다."),
    ASSET_TOO_LARGE(HttpStatus.BAD_REQUEST, "파일 크기가 제한을 초과했습니다."),
    ASSET_UPLOAD_INCOMPLETE(HttpStatus.CONFLICT, "파일 업로드가 완료되지 않았습니다."),
    ASSET_IN_USE(HttpStatus.CONFLICT, "캐릭터에서 사용 중인 파일은 삭제할 수 없습니다."),
    RENDER_JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "렌더 작업을 찾을 수 없습니다."),
    RENDER_ALREADY_IN_PROGRESS(HttpStatus.CONFLICT, "이미 진행 중인 렌더 작업이 있습니다."),
    RENDER_OUTPUT_MISSING(HttpStatus.CONFLICT, "렌더 결과물이 업로드되지 않았습니다."),
    INVALID_JOB_STATE(HttpStatus.CONFLICT, "현재 상태에서 수행할 수 없는 작업입니다."),
    INVALID_SCENE_DOCUMENT(HttpStatus.BAD_REQUEST, "Scene 문서 형식이 올바르지 않습니다."),
    SCENE_VERSION_CONFLICT(HttpStatus.CONFLICT, "다른 곳에서 프로젝트가 수정되었습니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "일시적인 오류가 발생했습니다.");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus status() {
        return status;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}
