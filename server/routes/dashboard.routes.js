const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// @route   GET /api/dashboard/stats
// @desc    Get all fleet KPI stats
// @access  Private (admin, manager)
router.get('/stats', authenticate, authorize('admin', 'manager'), dashboardController.getStats);

module.exports = router;
