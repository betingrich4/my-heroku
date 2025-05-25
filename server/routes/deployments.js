const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/auth');
const Deployment = require('../models/Deployment');
const docker = require('../utils/docker');
const logger = require('../utils/logger');

// @desc    Create new deployment
// @route   POST /api/deployments
// @access  Private
router.post('/', protect, asyncHandler(async (req, res) => {
  const { repoUrl, branch, envVars, buildCommand, startCommand, name } = req.body;
  
  // Validate GitHub URL
  if (!repoUrl.match(/github\.com\/.+\/.+/)) {
    res.status(400);
    throw new Error('Invalid GitHub repository URL');
  }
  
  const deployment = await Deployment.create({
    user: req.user.id,
    name,
    repoUrl,
    branch: branch || 'main',
    envVars,
    buildCommand: buildCommand || 'npm install',
    startCommand: startCommand || 'npm start',
    status: 'initializing'
  });
  
  // Emit event via Socket.io
  req.app.get('io').to(req.user.id).emit('deployment_update', {
    deploymentId: deployment._id,
    status: 'initializing'
  });
  
  // Trigger worker process (in production this would be a queue)
  try {
    await docker.buildAndStartContainer(deployment, req.user);
  } catch (err) {
    logger.error(`Deployment failed: ${err.message}`);
    deployment.status = 'failed';
    deployment.logs = err.message;
    await deployment.save();
    
    req.app.get('io').to(req.user.id).emit('deployment_update', {
      deploymentId: deployment._id,
      status: 'failed',
      logs: err.message
    });
    
    res.status(500).json({
      success: false,
      error: 'Deployment failed to start'
    });
    return;
  }
  
  res.status(201).json({
    success: true,
    data: deployment
  });
}));

// @desc    Get all user deployments
// @route   GET /api/deployments
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const deployments = await Deployment.find({ user: req.user.id });
  
  res.status(200).json({
    success: true,
    count: deployments.length,
    data: deployments
  });
}));

// @desc    Get single deployment
// @route   GET /api/deployments/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const deployment = await Deployment.findOne({
    _id: req.params.id,
    user: req.user.id
  });
  
  if (!deployment) {
    res.status(404);
    throw new Error('Deployment not found');
  }
  
  res.status(200).json({
    success: true,
    data: deployment
  });
}));

// @desc    Update deployment
// @route   PUT /api/deployments/:id
// @access  Private
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const deployment = await Deployment.findOne({
    _id: req.params.id,
    user: req.user.id
  });
  
  if (!deployment) {
    res.status(404);
    throw new Error('Deployment not found');
  }
  
  // Only allow updating certain fields
  const { envVars, buildCommand, startCommand, name } = req.body;
  
  if (envVars) deployment.envVars = envVars;
  if (buildCommand) deployment.buildCommand = buildCommand;
  if (startCommand) deployment.startCommand = startCommand;
  if (name) deployment.name = name;
  
  await deployment.save();
  
  // Emit update event
  req.app.get('io').to(req.user.id).emit('deployment_update', {
    deploymentId: deployment._id,
    status: deployment.status,
    updatedAt: deployment.updatedAt
  });
  
  res.status(200).json({
    success: true,
    data: deployment
  });
}));

// @desc    Restart deployment
// @route   POST /api/deployments/:id/restart
// @access  Private
router.post('/:id/restart', protect, asyncHandler(async (req, res) => {
  const deployment = await Deployment.findOne({
    _id: req.params.id,
    user: req.user.id
  });
  
  if (!deployment) {
    res.status(404);
    throw new Error('Deployment not found');
  }
  
  deployment.status = 'restarting';
  await deployment.save();
  
  // Emit event
  req.app.get('io').to(req.user.id).emit('deployment_update', {
    deploymentId: deployment._id,
    status: 'restarting'
  });
  
  try {
    await docker.restartContainer(deployment, req.user);
  } catch (err) {
    logger.error(`Restart failed: ${err.message}`);
    deployment.status = 'failed';
    deployment.logs = err.message;
    await deployment.save();
    
    req.app.get('io').to(req.user.id).emit('deployment_update', {
      deploymentId: deployment._id,
      status: 'failed',
      logs: err.message
    });
    
    res.status(500).json({
      success: false,
      error: 'Restart failed'
    });
    return;
  }
  
  res.status(200).json({
    success: true,
    data: deployment
  });
}));

// @desc    Delete deployment
// @route   DELETE /api/deployments/:id
// @access  Private
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const deployment = await Deployment.findOne({
    _id: req.params.id,
    user: req.user.id
  });
  
  if (!deployment) {
    res.status(404);
    throw new Error('Deployment not found');
  }
  
  try {
    await docker.stopContainer(deployment);
  } catch (err) {
    logger.error(`Error stopping container: ${err.message}`);
  }
  
  await deployment.remove();
  
  // Emit event
  req.app.get('io').to(req.user.id).emit('deployment_removed', {
    deploymentId: req.params.id
  });
  
  res.status(200).json({
    success: true,
    data: {}
  });
}));

module.exports = router;
