package com.characteranimator.api.render;

import com.characteranimator.api.common.storage.StoragePort;
import com.characteranimator.api.project.ProjectDeletedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ProjectDeletedRenderJobCleaner {

    private static final Logger log = LoggerFactory.getLogger(ProjectDeletedRenderJobCleaner.class);

    private final RenderJobRepository renderJobRepository;
    private final StoragePort storagePort;

    public ProjectDeletedRenderJobCleaner(RenderJobRepository renderJobRepository, StoragePort storagePort) {
        this.renderJobRepository = renderJobRepository;
        this.storagePort = storagePort;
    }

    @EventListener
    public void on(ProjectDeletedEvent event) {
        List<RenderJob> jobs = renderJobRepository.findAllByProjectId(event.projectId());
        renderJobRepository.deleteAll(jobs);
        try {
            storagePort.deleteAll(jobs.stream().map(RenderJob::getOutputKey).toList());
        } catch (Exception e) {
            log.warn("Failed to delete render outputs for project {}", event.projectId(), e);
        }
    }
}
