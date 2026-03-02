const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/manager.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All manager routes require: valid JWT + role of 'manager' or 'admin'
const guard = [authenticate, authorize('admin', 'manager')];

// ── DASHBOARD ────────────────────────────────────────────────────────────────
// @route  GET /api/manager/dashboard-stats
// @desc   KPIs: trips today, on-time rate, pending dispatch, vehicles in maintenance
router.get('/dashboard-stats', guard, ctrl.getDashboardStats);

// @route  GET /api/manager/fleet-summary
// @desc   Counts: onRoad / idle / maintenance  →  feeds ApexCharts donut
router.get('/fleet-summary', guard, ctrl.getFleetSummary);

// ── FLEET VIEW ────────────────────────────────────────────────────────────────
// @route  GET /api/manager/fleet
// @desc   All vehicles with computed_status + current trip + assigned driver
router.get('/fleet', guard, ctrl.getManagerFleet);

// ── MAINTENANCE ───────────────────────────────────────────────────────────────
// @route  GET /api/manager/maintenance
// @desc   All work orders; optional ?status=  ?order_type=
router.get('/maintenance', guard, ctrl.getMaintenanceOrders);

// @route  GET /api/manager/maintenance/stats
// @desc   KPIs: vehicles in service, avg downtime, month cost
router.get('/maintenance/stats', guard, ctrl.getMaintenanceStats);

// @route  GET /api/manager/maintenance/cost-chart
// @desc   Last 6 months maintenance cost data for ApexCharts
router.get('/maintenance/cost-chart', guard, ctrl.getMaintenanceCostChart);

// @route  GET /api/manager/maintenance/proactive
// @desc   Upcoming proactive service orders
router.get('/maintenance/proactive', guard, ctrl.getProactiveMaintenance);

// @route  POST /api/manager/maintenance
// @desc   Create a new maintenance work order
router.post('/maintenance', guard, ctrl.createMaintenanceOrder);

// @route  PATCH /api/manager/maintenance/:orderId/status
// @desc   Update Kanban status of a work order
router.patch('/maintenance/:orderId/status', guard, ctrl.updateOrderStatus);

// ── ACTIVITY FEED ─────────────────────────────────────────────────────────────
// @route  GET /api/manager/activity
// @desc   Recent dispatch activity events for the live feed panel
router.get('/activity', guard, ctrl.getActivityFeed);

module.exports = router;
