package com.characteranimator.api.render;

public enum OutputFormat {
    MP4("mp4", "video/mp4"),
    WEBM("webm", "video/webm"),
    GIF("gif", "image/gif");

    private final String extension;
    private final String contentType;

    OutputFormat(String extension, String contentType) {
        this.extension = extension;
        this.contentType = contentType;
    }

    public String extension() {
        return extension;
    }

    public String contentType() {
        return contentType;
    }
}
