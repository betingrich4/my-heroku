const Docker = require('dockerode');
const { PassThrough } = require('stream');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const axios = require('axios');
const tar = require('tar-fs');

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock'
});

// Directory where repos will be cloned
const REPOS_DIR = path.join(__dirname, '../../repos');
if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

// Build and start container for a deployment
const buildAndStartContainer = async (deployment, user) => {
  const repoDir = path.join(REPOS_DIR, deployment._id.toString());
  
  try {
    // Clone repository
    deployment.status = 'cloning';
    deployment.logs = 'Cloning repository...';
    await deployment.save();
    
    await simpleGit().clone(deployment.repoUrl, repoDir, [
      '--branch', deployment.branch,
      '--depth', '1'
    ]);
    
    // Create Dockerfile if not exists
    if (!fs.existsSync(path.join(repoDir, 'Dockerfile'))) {
      const dockerfileContent = `
FROM node:14
WORKDIR /app
COPY . .
RUN ${deployment.buildCommand}
CMD ${deployment.startCommand}
      `;
      fs.writeFileSync(path.join(repoDir, 'Dockerfile'), dockerfileContent.trim());
    }
    
    // Build image
    deployment.status = 'building';
    deployment.logs = 'Building Docker image...';
    await deployment.save();
    
    const buildStream = await docker.buildImage(tar.pack(repoDir), {
      t: `deploybot-${deployment._id}`,
      buildargs: Object.entries(deployment.envVars).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {})
    });
    
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(buildStream, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
    
    // Create container
    deployment.status = 'starting';
    deployment.logs = 'Starting container...';
    await deployment.save();
    
    const container = await docker.createContainer({
      Image: `deploybot-${deployment._id}`,
      name: `deploybot-${deployment._id}-${user.id}`,
      Env: Object.entries(deployment.envVars).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        RestartPolicy: {
          Name: 'always'
        }
      }
    });
    
    await container.start();
    
    // Save container info
    deployment.containerId = container.id;
    deployment.status = 'running';
    deployment.logs = 'Container running successfully';
    deployment.url = `http://${container.id.slice(0, 12)}.${process.env.DEPLOYMENT_DOMAIN || 'deploybot.app'}`;
    await deployment.save();
    
    return container;
  } catch (err) {
    // Clean up on error
    try {
      const containers = await docker.listContainers({ all: true });
      const containerInfo = containers.find(c => c.Names.includes(`/deploybot-${deployment._id}-${user.id}`));
      
      if (containerInfo) {
        const container = docker.getContainer(containerInfo.Id);
        await container.stop();
        await container.remove();
      }
      
      const images = await docker.listImages();
      const imageInfo = images.find(img => img.RepoTags && img.RepoTags.includes(`deploybot-${deployment._id}:latest`));
      
      if (imageInfo) {
        await docker.getImage(imageInfo.Id).remove();
      }
    } catch (cleanupErr) {
      logger.error(`Cleanup failed: ${cleanupErr.message}`);
    }
    
    throw err;
  }
};

// Restart container
const restartContainer = async (deployment) => {
  if (!deployment.containerId) {
    throw new Error('Container ID not found');
  }
  
  try {
    const container = docker.getContainer(deployment.containerId);
    await container.restart();
    
    deployment.status = 'running';
    deployment.logs = 'Container restarted successfully';
    await deployment.save();
    
    return container;
  } catch (err) {
    deployment.status = 'failed';
    deployment.logs = `Restart failed: ${err.message}`;
    await deployment.save();
    
    throw err;
  }
};

// Stop and remove container
const stopContainer = async (deployment) => {
  if (!deployment.containerId) {
    return;
  }
  
  try {
    const container = docker.getContainer(deployment.containerId);
    await container.stop();
    await container.remove();
    
    // Remove image
    const images = await docker.listImages();
    const imageInfo = images.find(img => img.RepoTags && img.RepoTags.includes(`deploybot-${deployment._id}:latest`));
    
    if (imageInfo) {
      await docker.getImage(imageInfo.Id).remove();
    }
    
    // Remove repo directory
    const repoDir = path.join(REPOS_DIR, deployment._id.toString());
    if (fs.existsSync(repoDir)) {
      fs.rmSync(repoDir, { recursive: true });
    }
  } catch (err) {
    logger.error(`Error stopping container: ${err.message}`);
    throw err;
  }
};

module.exports = {
  buildAndStartContainer,
  restartContainer,
  stopContainer,
  docker
};
