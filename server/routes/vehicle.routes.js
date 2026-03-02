const express = require('express');
const router = express.Router();
const multer = require('multer');
const vehicleController = require('../controllers/vehicle.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Multer — memory storage, files buffered in RAM then streamed to Supabase Storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB per file
});

// @route   GET /api/vehicles
// @access  Private (admin, manager)
router.get('/', authenticate, authorize('admin', 'manager'), vehicleController.getAllVehicles);

// @route   GET /api/vehicles/:vehicleId
// @access  Private
router.get('/:vehicleId', authenticate, authorize('admin', 'manager'), vehicleController.getVehicleById);

// @route   POST /api/vehicles
// @desc    Register a new vehicle (multipart/form-data — supports rc_document + insurance_document uploads)
// @access  Private (admin)
router.post('/', authenticate, authorize('admin'),
    upload.fields([
        { name: 'rc_document',        maxCount: 1 },
        { name: 'insurance_document', maxCount: 1 }
    ]),
    vehicleController.addVehicle
);

// @route   PUT /api/vehicles/:vehicleId/status
// @desc    Block / Unblock / Set maintenance
// @access  Private (admin, manager)
router.put('/:vehicleId/status', authenticate, authorize('admin', 'manager'), vehicleController.updateVehicleStatus);

// @route   PUT /api/vehicles/:vehicleId
// @desc    Update vehicle details
// @access  Private (admin)
router.put('/:vehicleId', authenticate, authorize('admin'), vehicleController.updateVehicle);

// @route   DELETE /api/vehicles/:vehicleId
// @desc    Remove vehicle from fleet
// @access  Private (admin)
router.delete('/:vehicleId', authenticate, authorize('admin'), vehicleController.deleteVehicle);

module.exports = router;
