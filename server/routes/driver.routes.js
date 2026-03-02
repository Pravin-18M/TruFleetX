const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driver.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// @route   GET /api/drivers
// @desc    Get all approved drivers with their profiles
// @access  Private (admin, manager)
router.get('/', authenticate, authorize('admin', 'manager'), driverController.getAllDrivers);

// @route   GET /api/drivers/stats
// @desc    Get driver count stats
// @access  Private (admin, manager)
router.get('/stats', authenticate, authorize('admin', 'manager'), driverController.getDriverStats);

// @route   GET /api/drivers/:driverId
// @desc    Get a single driver with profile
// @access  Private (admin, manager)
router.get('/:driverId', authenticate, authorize('admin', 'manager'), driverController.getDriverById);

// @route   PUT /api/drivers/:driverId/profile
// @desc    Create or update a driver's profile
// @access  Private (admin)
router.put('/:driverId/profile', authenticate, authorize('admin'), driverController.upsertDriverProfile);

// @route   PUT /api/drivers/:driverId/status
// @desc    Update driver availability status
// @access  Private (admin, manager)
router.put('/:driverId/status', authenticate, authorize('admin', 'manager'), driverController.updateDriverStatus);

module.exports = router;
