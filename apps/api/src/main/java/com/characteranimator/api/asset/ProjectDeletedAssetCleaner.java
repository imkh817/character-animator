package com.characteranimator.api.asset;

import com.characteranimator.api.project.ProjectDeletedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class ProjectDeletedAssetCleaner {

    private final AssetService assetService;

    public ProjectDeletedAssetCleaner(AssetService assetService) {
        this.assetService = assetService;
    }

    @EventListener
    public void on(ProjectDeletedEvent event) {
        assetService.deleteAllForProject(event.projectId());
    }
}
