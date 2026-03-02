const express = require('express');
const router = express.Router();
const insuranceController = require('../controllers/insurance.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// @route   GET /api/insurance
// @desc    Get all policies with vehicle data
// @access  Private (admin, manager)
router.get('/', authenticate, authorize('admin', 'manager'), insuranceController.getAllPolicies);

// @route   GET /api/insurance/stats
// @desc    Get insurance KPI stats
// @access  Private (admin, manager)
router.get('/stats', authenticate, authorize('admin', 'manager'), insuranceController.getInsuranceStats);

// @route   GET /api/insurance/urgent
// @desc    Get policies expiring within 7 days + already expired
// @access  Private (admin, manager)
router.get('/urgent', authenticate, authorize('admin', 'manager'), insuranceController.getUrgentPolicies);

// @route   GET /api/insurance/upcoming
// @desc    Get upcoming renewals (next 30 days) for dashboard
// @access  Private (admin, manager)
router.get('/upcoming', authenticate, authorize('admin', 'manager'), insuranceController.getUpcomingRenewals);

// @route   POST /api/insurance
// @desc    Add a new insurance policy
// @access  Private (admin)
router.post('/', authenticate, authorize('admin'), insuranceController.addPolicy);

// @route   PUT /api/insurance/:policyId
// @desc    Update / renew a policy
// @access  Private (admin)
router.put('/:policyId', authenticate, authorize('admin'), insuranceController.updatePolicy);

// @route   DELETE /api/insurance/:policyId
// @desc    Delete a policy
// @access  Private (admin)
router.delete('/:policyId', authenticate, authorize('admin'), insuranceController.deletePolicy);

module.exports = router;
