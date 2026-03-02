const express = require('express');
const router  = express.Router();
const c       = require('../controllers/driver_portal.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All driver portal routes require a valid JWT and the 'driver' role.
// Admin & manager roles are also granted access so they can test/demo the portal.
const guard = [authenticate, authorize('driver', 'admin', 'manager')];

// ── Profile ────────────────────────────────────────────────────────────────
router.get('/me',                      guard, c.getMe);

// ── Trips ──────────────────────────────────────────────────────────────────
// IMPORTANT: /trips/stats MUST be registered BEFORE /trips/:id
// to prevent Express from matching the literal string "stats" as a trip UUID.
router.get('/trips/stats',             guard, c.getMyStats);
router.get('/trips',                   guard, c.getMyTrips);
router.get('/current-trip',            guard, c.getCurrentTrip);
router.put('/trips/:tripId/complete',  guard, c.completeMyTrip);

// ── Vehicle ────────────────────────────────────────────────────────────────
router.get('/vehicle',                 guard, c.getMyVehicle);
router.post('/vehicle/issue',          guard, c.reportVehicleIssue);

// ── Dispatch (Driver can raise a request) ──────────────────────────────────
router.get('/vehicle-lookup',          guard, c.lookupVehicleByPlate);
router.get('/available-vehicles',      guard, c.getAvailableVehicles);
router.post('/dispatch',               guard, c.raiseDispatchRequest);

// ── Documents ──────────────────────────────────────────────────────────────
router.get('/documents',               guard, c.getMyDocuments);

// ── Support ────────────────────────────────────────────────────────────────
router.get('/support/contacts',        guard, c.getSupportContacts);
router.get('/support/tickets',         guard, c.getMyTickets);
router.post('/support/tickets',        guard, c.createTicket);

// ── Emergency SOS ──────────────────────────────────────────────────────────
router.post('/sos',                    guard, c.triggerSOS);

module.exports = router;
