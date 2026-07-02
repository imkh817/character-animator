package com.characteranimator.api.common.storage;

import com.characteranimator.api.common.config.AppProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

@Configuration
public class StorageConfig {

    // MinIO는 virtual-host 스타일(bucket.host)을 지원하지 않으므로 path-style을 강제한다.
    private static final S3Configuration PATH_STYLE = S3Configuration.builder()
            .pathStyleAccessEnabled(true)
            .build();

    @Bean
    public S3Client s3Client(AppProperties properties) {
        AppProperties.Storage storage = properties.storage();
        return S3Client.builder()
                .endpointOverride(URI.create(storage.endpoint()))
                .region(Region.of(storage.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(storage.accessKey(), storage.secretKey())))
                .serviceConfiguration(PATH_STYLE)
                .build();
    }

    @Bean
    public S3Presigner s3Presigner(AppProperties properties) {
        AppProperties.Storage storage = properties.storage();
        return S3Presigner.builder()
                .endpointOverride(URI.create(storage.endpoint()))
                .region(Region.of(storage.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(storage.accessKey(), storage.secretKey())))
                .serviceConfiguration(PATH_STYLE)
                .build();
    }
}
