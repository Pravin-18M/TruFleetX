const express = require('express');
const router  = express.Router();
const sc      = require('../controllers/sysadmin.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All routes are admin-only
const guard = [authenticate, authorize('admin')];

// @route  GET /api/sysadmin/overview
router.get('/overview',      ...guard, sc.getOverview);

// @route  GET /api/sysadmin/audit-log
// @query  ?limit=N  &type=VEHICLE  &sev=CRITICAL  &q=search
router.get('/audit-log',     ...guard, sc.getAuditLog);

// @route  GET /api/sysadmin/users
router.get('/users',         ...guard, sc.getAllUsers);

// @route  DELETE /api/sysadmin/users/:userId
router.delete('/users/:userId', ...guard, sc.deleteUser);

// @route  PUT /api/sysadmin/users/:userId/role
router.put('/users/:userId/role',     ...guard, sc.changeUserRole);

// @route  PUT /api/sysadmin/users/:userId/approval
router.put('/users/:userId/approval', ...guard, sc.toggleUserApproval);

// @route  GET /api/sysadmin/db-stats
router.get('/db-stats',      ...guard, sc.getDbStats);

// @route  GET /api/sysadmin/fleet-activity
router.get('/fleet-activity',...guard, sc.getFleetActivity);

module.exports = router;
