const express = require('express');
const router = express.Router();
const dispatchController = require('../controllers/dispatch.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// @route   GET /api/dispatch/stats
// @desc    Get pending, active, critical counts
// @access  Private (admin, manager)
router.get('/stats', authenticate, authorize('admin', 'manager'), dispatchController.getDispatchStats);

// @route   GET /api/dispatch/pending
// @desc    Get all pending dispatch requests
// @access  Private (admin, manager)
router.get('/pending', authenticate, authorize('admin', 'manager'), dispatchController.getPendingRequests);

// @route   GET /api/dispatch/active
// @desc    Get all active trips
// @access  Private (admin, manager)
router.get('/active', authenticate, authorize('admin', 'manager'), dispatchController.getActiveTrips);

// @route   GET /api/dispatch/history
// @desc    Get completed/rejected trips
// @access  Private (admin, manager)
router.get('/history', authenticate, authorize('admin', 'manager'), dispatchController.getHistory);

// @route   POST /api/dispatch
// @desc    Create a new dispatch request
// @access  Private (admin, manager)
router.post('/', authenticate, authorize('admin', 'manager'), dispatchController.createRequest);

// @route   PUT /api/dispatch/approve/:requestId
// @desc    Approve and activate a dispatch request
// @access  Private (admin, manager)
router.put('/approve/:requestId', authenticate, authorize('admin', 'manager'), dispatchController.approveRequest);

// @route   PUT /api/dispatch/complete/:requestId
// @desc    Mark a trip as completed
// @access  Private (admin, manager)
router.put('/complete/:requestId', authenticate, authorize('admin', 'manager'), dispatchController.completeTrip);

// @route   DELETE /api/dispatch/reject/:requestId
// @desc    Reject a dispatch request
// @access  Private (admin, manager)
router.delete('/reject/:requestId', authenticate, authorize('admin', 'manager'), dispatchController.rejectRequest);

module.exports = router;
