package com.characteranimator.api.common.storage;

import com.characteranimator.api.common.config.AppProperties;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URL;
import java.time.Duration;
import java.util.Collection;
import java.util.Optional;

@Component
public class S3StorageAdapter implements StoragePort {

    private static final Logger log = LoggerFactory.getLogger(S3StorageAdapter.class);

    private final S3Client s3Client;
    private final S3Presigner presigner;
    private final String bucket;
    private final boolean autoCreateBucket;

    public S3StorageAdapter(S3Client s3Client, S3Presigner presigner, AppProperties properties) {
        this.s3Client = s3Client;
        this.presigner = presigner;
        this.bucket = properties.storage().bucket();
        this.autoCreateBucket = properties.storage().autoCreateBucket();
    }

    /** 로컬(MinIO) 편의 기능. 운영 S3/R2에서는 버킷을 미리 만들고 이 옵션을 끈다. */
    @PostConstruct
    void ensureBucket() {
        if (!autoCreateBucket) {
            return;
        }
        try {
            s3Client.headBucket(b -> b.bucket(bucket));
        } catch (NoSuchBucketException e) {
            log.info("Creating bucket '{}'", bucket);
            s3Client.createBucket(b -> b.bucket(bucket));
        }
    }

    @Override
    public URL issueUploadUrl(String objectKey, String contentType, Duration ttl) {
        return presigner.presignPutObject(p -> p
                        .signatureDuration(ttl)
                        .putObjectRequest(r -> r.bucket(bucket).key(objectKey).contentType(contentType)))
                .url();
    }

    @Override
    public URL issueDownloadUrl(String objectKey, Duration ttl) {
        return presigner.presignGetObject(p -> p
                        .signatureDuration(ttl)
                        .getObjectRequest(r -> r.bucket(bucket).key(objectKey)))
                .url();
    }

    @Override
    public Optional<ObjectMetadata> head(String objectKey) {
        try {
            HeadObjectResponse response = s3Client.headObject(r -> r.bucket(bucket).key(objectKey));
            return Optional.of(new ObjectMetadata(response.contentLength(), response.contentType()));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        }
    }

    @Override
    public void delete(String objectKey) {
        s3Client.deleteObject(r -> r.bucket(bucket).key(objectKey));
    }

    @Override
    public void deleteAll(Collection<String> objectKeys) {
        if (objectKeys.isEmpty()) {
            return;
        }
        Delete delete = Delete.builder()
                .objects(objectKeys.stream()
                        .map(key -> ObjectIdentifier.builder().key(key).build())
                        .toList())
                .build();
        s3Client.deleteObjects(r -> r.bucket(bucket).delete(delete));
    }
}
