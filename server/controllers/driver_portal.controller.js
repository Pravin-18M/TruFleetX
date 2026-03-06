const supabase = require('../config/supabaseClient');
const { writeAudit } = require('./sysadmin.controller');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/me
// Returns the logged-in driver's full profile + assigned vehicle
// ─────────────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('users')
            .select(`
                id, full_name, email, avatar_url, created_at,
                driver_profiles (
                    phone, license_number, license_type, license_expiry,
                    safety_score, miles_this_month, total_incidents, years_experience,
                    on_time_rate, status, assigned_vehicle_id,
                    vehicles (
                        id, make, model, year, registration_number, vin,
                        status, fuel_level, current_location
                    )
                )
            `)
            .eq('id', userId)
            .single();

        if (error) return res.status(404).json({ error: 'Driver not found.' });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/current-trip
// Returns the driver's current active/pending dispatch request
// ─────────────────────────────────────────────────────────────────────────────
exports.getCurrentTrip = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('dispatch_requests')
            .select('*, vehicle:vehicles(make, model, registration_number)')
            .eq('driver_id', userId)
            .in('status', ['pending', 'active'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });
        res.json(data); // null if no active trip
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/trips
// Query: ?view=upcoming  (pending/active)  |  ?view=history  (completed/rejected)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyTrips = async (req, res) => {
    try {
        const userId = req.user.id;
        const view   = req.query.view || 'upcoming';
        const statuses = view === 'upcoming' ? ['pending', 'active'] : ['completed', 'rejected'];

        const { data, error } = await supabase
            .from('dispatch_requests')
            .select('*, vehicle:vehicles(make, model, registration_number)')
            .eq('driver_id', userId)
            .in('status', statuses)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/trips/stats
// Returns safety_score, miles_this_month, completed trips count, on_time_rate
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyStats = async (req, res) => {
    try {
        const userId = req.user.id;

        const [profileRes, completedRes] = await Promise.all([
            supabase
                .from('driver_profiles')
                .select('safety_score, miles_this_month, total_incidents, on_time_rate')
                .eq('user_id', userId)
                .single(),
            supabase
                .from('dispatch_requests')
                .select('*', { count: 'exact', head: true })
                .eq('driver_id', userId)
                .eq('status', 'completed')
        ]);

        if (profileRes.error) return res.status(404).json({ error: 'Profile not found.' });

        const profile         = profileRes.data;
        const completedTrips  = completedRes.count || 0;
        const onTimeRate      = profile.on_time_rate != null
            ? profile.on_time_rate
            : (profile.total_incidents === 0
                ? 100
                : Math.max(Math.round((completedTrips - profile.total_incidents) / Math.max(completedTrips, 1) * 100), 0));

        res.json({
            safetyScore:   profile.safety_score   || 0,
            totalTrips:    completedTrips,
            totalDistance: profile.miles_this_month || 0,
            onTimeRate
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/driver/trips/:tripId/complete
// Driver marks their own active trip as completed
// ─────────────────────────────────────────────────────────────────────────────
exports.completeMyTrip = async (req, res) => {
    try {
        const userId = req.user.id;
        const { tripId } = req.params;

        // Verify ownership
        const { data: existing } = await supabase
            .from('dispatch_requests')
            .select('id, driver_id, status')
            .eq('id', tripId)
            .single();

        if (!existing) return res.status(404).json({ error: 'Trip not found.' });
        if (existing.driver_id !== userId) return res.status(403).json({ error: 'Not your trip.' });
        if (existing.status !== 'active') return res.status(400).json({ error: 'Only active trips can be completed.' });

        const { data, error } = await supabase
            .from('dispatch_requests')
            .update({
                status:       'completed',
                progress_pct:  100,
                completed_at:  new Date().toISOString(),
                trip_notes:    (req.body?.notes || '').trim() || null,
                updated_at:    new Date().toISOString()
            })
            .eq('id', tripId)
            .select();

        if (error) return res.status(500).json({ error: error.message });

        // Update driver status back to available
        await supabase
            .from('driver_profiles')
            .update({ status: 'available' })
            .eq('user_id', userId);

        writeAudit({
            type:        'TRIP_COMPLETED',
            severity:    'INFO',
            actorId:     userId,
            actorName:   req.user?.full_name || req.user?.email,
            actorRole:   req.user?.role,
            entityType:  'dispatch_request',
            entityId:    tripId,
            entityLabel: `Ticket ${existing.ticket_number || tripId.slice(-6)}`,
            details:     { notes: req.body?.notes || null }
        });

        res.json({ message: 'Trip marked as completed.', request: data[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/vehicle
// Returns the driver's assigned vehicle + latest insurance + next maintenance
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyVehicle = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: profile, error: pErr } = await supabase
            .from('driver_profiles')
            .select('assigned_vehicle_id')
            .eq('user_id', userId)
            .single();

        if (pErr || !profile?.assigned_vehicle_id) {
            return res.status(404).json({ error: 'No vehicle assigned to this driver.' });
        }

        const vehicleId = profile.assigned_vehicle_id;

        const [vehicleRes, insuranceRes, maintenanceRes] = await Promise.all([
            supabase.from('vehicles')
                .select('*')
                .eq('id', vehicleId)
                .single(),
            supabase.from('insurance_policies')
                .select('*')
                .eq('vehicle_id', vehicleId)
                .order('expiry_date', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabase.from('maintenance_orders')
                .select('id, title, scheduled_date, status')
                .eq('vehicle_id', vehicleId)
                .in('status', ['scheduled', 'in-service'])
                .order('scheduled_date', { ascending: true })
                .limit(1)
                .maybeSingle()
        ]);

        if (vehicleRes.error) return res.status(500).json({ error: vehicleRes.error.message });

        res.json({
            vehicle:         vehicleRes.data,
            insurance:       insuranceRes.data,
            nextMaintenance: maintenanceRes.data
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/driver/vehicle/issue
// Driver reports a mechanical issue → creates a maintenance_order
// ─────────────────────────────────────────────────────────────────────────────
exports.reportVehicleIssue = async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, priority, description } = req.body;

        if (!description) return res.status(400).json({ error: 'Description is required.' });

        const { data: profile, error: pErr } = await supabase
            .from('driver_profiles')
            .select('assigned_vehicle_id')
            .eq('user_id', userId)
            .single();

        if (pErr || !profile?.assigned_vehicle_id) {
            return res.status(400).json({ error: 'No vehicle assigned. Cannot report issue.' });
        }

        const priorityMap = {
            'Low - Can wait for next service': 'low',
            'Medium - Requires attention soon': 'medium',
            'High - Vehicle cannot drive': 'high'
        };
        const resolvedPriority = priorityMap[priority] || 'medium';

        const { data, error } = await supabase
            .from('maintenance_orders')
            .insert([{
                vehicle_id:   profile.assigned_vehicle_id,
                title:        category || 'Driver Reported Issue',
                description,
                priority:     resolvedPriority,
                status:       'scheduled',
                order_type:   'corrective'
            }])
            .select();

        if (error) return res.status(500).json({ error: error.message });

        // High priority → set vehicle to maintenance so fleet manager is alerted
        if (resolvedPriority === 'high') {
            await supabase
                .from('vehicles')
                .update({ status: 'maintenance' })
                .eq('id', profile.assigned_vehicle_id);
        }

        res.status(201).json({ message: 'Issue reported. Maintenance ticket created.', order: data[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/documents
// Returns driver license details + vehicle registration + insurance docs
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyDocuments = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: profile, error: pErr } = await supabase
            .from('driver_profiles')
            .select('license_number, license_type, license_expiry, aadhar_number, medical_cert_expiry, assigned_vehicle_id')
            .eq('user_id', userId)
            .single();

        if (pErr) return res.status(404).json({ error: 'Driver profile not found.' });

        let vehicleDocs = { vehicle: null, insurance: null };

        if (profile.assigned_vehicle_id) {
            const [vehicleRes, insuranceRes] = await Promise.all([
                supabase.from('vehicles')
                    .select('registration_number, vin, rc_document_url, make, model, year, rc_expiry')
                    .eq('id', profile.assigned_vehicle_id)
                    .single(),
                supabase.from('insurance_policies')
                    .select('*')
                    .eq('vehicle_id', profile.assigned_vehicle_id)
                    .order('expiry_date', { ascending: false })
                    .limit(1)
                    .maybeSingle()
            ]);
            vehicleDocs.vehicle   = vehicleRes.data;
            vehicleDocs.insurance = insuranceRes.data;
        }

        res.json({
            license: {
                number: profile.license_number,
                type:   profile.license_type,
                expiry: profile.license_expiry
            },
            aadhar: {
                number: profile.aadhar_number
            },
            medical: {
                expiry: profile.medical_cert_expiry
            },
            vehicle:   vehicleDocs.vehicle,
            insurance: vehicleDocs.insurance
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/support/contacts
// Returns managers & admins for the emergency contact list
// ─────────────────────────────────────────────────────────────────────────────
exports.getSupportContacts = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, full_name, email, role')
            .in('role', ['admin', 'manager'])
            .eq('is_approved', true)
            .order('role');

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/support/tickets
// Returns all support tickets for the logged-in driver
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyTickets = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('support_tickets')
            .select('*')
            .eq('driver_id', userId)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/driver/support/tickets
// Driver raises a new support ticket
// ─────────────────────────────────────────────────────────────────────────────
exports.createTicket = async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, subject, description } = req.body;

        if (!subject || !description) {
            return res.status(400).json({ error: 'Subject and description are required.' });
        }

        const { data, error } = await supabase
            .from('support_tickets')
            .insert([{
                driver_id:   userId,
                category:    category || 'Other',
                subject,
                description,
                status:      'open',
                priority:    'medium'
            }])
            .select();

        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json({ message: 'Ticket created.', ticket: data[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/available-vehicles
// Returns all vehicles with insurance + availability eligibility checks
// ─────────────────────────────────────────────────────────────────────────────
exports.getAvailableVehicles = async (req, res) => {
    try {
        const today = new Date();

        // Fetch all vehicles (not blocked)
        const { data: vehicles, error: vErr } = await supabase
            .from('vehicles')
            .select('id, registration_number, make, model, year, status')
            .not('status', 'eq', 'blocked')
            .order('registration_number');

        if (vErr) return res.status(500).json({ error: vErr.message });
        if (!vehicles || !vehicles.length) return res.json([]);

        // Which vehicle_ids are currently on active/pending trips?
        const { data: activeTrips } = await supabase
            .from('dispatch_requests')
            .select('vehicle_id')
            .in('status', ['active', 'pending']);
        const onRoadSet = new Set((activeTrips || []).map(t => t.vehicle_id).filter(Boolean));

        // Fetch the latest insurance policy per vehicle
        const vehicleIds = vehicles.map(v => v.id);
        const { data: allInsurances } = await supabase
            .from('insurance_policies')
            .select('vehicle_id, expiry_date, policy_number')
            .in('vehicle_id', vehicleIds)
            .order('expiry_date', { ascending: false });

        // Build a map: vehicle_id → latest policy
        const latestIns = {};
        (allInsurances || []).forEach(ins => {
            if (!latestIns[ins.vehicle_id]) latestIns[ins.vehicle_id] = ins;
        });

        // Compute eligibility for each vehicle
        const result = vehicles.map(v => {
            const ins         = latestIns[v.id] || null;
            const notMaint    = v.status !== 'maintenance';
            const notOnTrip   = !onRoadSet.has(v.id);
            let insValid = false, expiryDate = null, daysLeft = null;

            if (ins) {
                expiryDate = ins.expiry_date;
                daysLeft   = Math.ceil((new Date(ins.expiry_date) - today) / 86400000);
                insValid   = daysLeft > 0;
            }

            const eligible = insValid && notMaint && notOnTrip;
            const reason   = !ins         ? 'No insurance policy found'
                           : !insValid    ? `Insurance expired ${Math.abs(daysLeft)} days ago`
                           : !notMaint    ? 'Vehicle is in maintenance'
                           : !notOnTrip   ? 'Already on an active trip'
                           : 'All checks passed';

            return {
                id: v.id,
                registration_number: v.registration_number,
                make: v.make,
                model: v.model,
                year: v.year,
                status: v.status,
                insurance: ins ? { expiry_date: expiryDate, policy_number: ins.policy_number, days_left: daysLeft } : null,
                checks: { insurance_valid: insValid, not_in_maintenance: notMaint, not_on_trip: notOnTrip },
                eligible,
                eligibility_reason: reason
            };
        });

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/vehicle-lookup?last4=XXXX
// Driver enters last 4 digits of registration; returns vehicle + eligibility checks
// ─────────────────────────────────────────────────────────────────────────────
exports.lookupVehicleByPlate = async (req, res) => {
    try {
        const last4 = (req.query.last4 || '').trim().toUpperCase();
        if (!last4 || last4.length < 2) {
            return res.status(400).json({ error: 'Please enter at least 2 characters of the vehicle number.' });
        }

        const today = new Date();

        // Find vehicle(s) whose registration ends with the given digits
        const { data: vehicles, error: vErr } = await supabase
            .from('vehicles')
            .select('id, registration_number, make, model, year, status, vin')
            .ilike('registration_number', `%${last4}`)
            .not('status', 'eq', 'blocked');

        if (vErr) return res.status(500).json({ error: vErr.message });
        if (!vehicles || !vehicles.length) {
            return res.status(404).json({ error: `No authorised vehicle found with number ending in "${last4}". Please check and try again.` });
        }

        // If multiple match, return all — front-end will show disambiguation
        const vehicleIds = vehicles.map(v => v.id);

        const [tripsRes, insRes] = await Promise.all([
            supabase.from('dispatch_requests')
                .select('vehicle_id')
                .in('status', ['active', 'pending'])
                .in('vehicle_id', vehicleIds),
            supabase.from('insurance_policies')
                .select('vehicle_id, expiry_date, policy_number')
                .in('vehicle_id', vehicleIds)
                .order('expiry_date', { ascending: false })
        ]);

        const onRoadSet = new Set((tripsRes.data || []).map(t => t.vehicle_id));
        const latestIns = {};
        (insRes.data || []).forEach(ins => {
            if (!latestIns[ins.vehicle_id]) latestIns[ins.vehicle_id] = ins;
        });

        const result = vehicles.map(v => {
            const ins      = latestIns[v.id] || null;
            const notMaint = v.status !== 'maintenance';
            const notOnTrip = !onRoadSet.has(v.id);
            let insValid = false, daysLeft = null, expiryDate = null;
            if (ins) {
                expiryDate = ins.expiry_date;
                daysLeft   = Math.ceil((new Date(ins.expiry_date) - today) / 86400000);
                insValid   = daysLeft > 0;
            }
            const eligible = insValid && notMaint && notOnTrip;
            const reason   = !ins       ? 'No insurance policy found'
                           : !insValid  ? `Insurance expired ${Math.abs(daysLeft)} day(s) ago`
                           : !notMaint  ? 'Vehicle is currently in maintenance'
                           : !notOnTrip ? 'Vehicle is already on an active trip'
                           : '✅ All checks passed — eligible for dispatch';
            return {
                id: v.id,
                registration_number: v.registration_number,
                make: v.make, model: v.model, year: v.year, status: v.status,
                insurance: ins ? { expiry_date: expiryDate, policy_number: ins.policy_number, days_left: daysLeft } : null,
                checks: { insurance_valid: insValid, not_in_maintenance: notMaint, not_on_trip: notOnTrip },
                eligible,
                eligibility_reason: reason
            };
        });

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/driver/dispatch
// Driver raises a new dispatch request — server re-validates vehicle eligibility
// ─────────────────────────────────────────────────────────────────────────────
exports.raiseDispatchRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const { vehicle_id, origin, destination, cargo_type, cargo_weight, priority } = req.body;

        if (!vehicle_id || !origin || !destination) {
            return res.status(400).json({ error: 'vehicle_id, origin, and destination are required.' });
        }

        const today = new Date();

        // Re-validate vehicle eligibility (server-side guard, never trust client)
        const [vehicleRes, insuranceRes, activeRes] = await Promise.all([
            supabase.from('vehicles')
                .select('id, status, registration_number')
                .eq('id', vehicle_id)
                .single(),
            supabase.from('insurance_policies')
                .select('expiry_date')
                .eq('vehicle_id', vehicle_id)
                .order('expiry_date', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabase.from('dispatch_requests')
                .select('id')
                .eq('vehicle_id', vehicle_id)
                .in('status', ['active', 'pending'])
                .limit(1)
        ]);

        if (!vehicleRes.data) return res.status(404).json({ error: 'Vehicle not found.' });
        const v = vehicleRes.data;

        if (v.status === 'maintenance') return res.status(400).json({ error: `${v.registration_number} is currently in maintenance.` });
        if (v.status === 'blocked')     return res.status(400).json({ error: `${v.registration_number} is blocked.` });

        if (activeRes.data && activeRes.data.length > 0)
            return res.status(400).json({ error: `${v.registration_number} is already on an active trip.` });

        if (!insuranceRes.data)
            return res.status(400).json({ error: `${v.registration_number} has no insurance policy.` });

        const daysLeft = Math.ceil((new Date(insuranceRes.data.expiry_date) - today) / 86400000);
        if (daysLeft <= 0)
            return res.status(400).json({ error: `${v.registration_number} insurance expired ${Math.abs(daysLeft)} days ago.` });

        // All checks passed — auto-approve and activate immediately
        const ticket_number = 'TRU-' + Date.now().toString().slice(-6);

        const { data, error } = await supabase
            .from('dispatch_requests')
            .insert([{
                ticket_number,
                vehicle_id,
                driver_id:    userId,
                origin,
                destination,
                cargo_type:   cargo_type   || null,
                cargo_weight: cargo_weight || null,
                priority:     priority     || 'standard',
                status:       'active'   // Auto-approved — no manual intervention required
            }])
            .select('*, vehicle:vehicles(make, model, registration_number)');

        if (error) return res.status(500).json({ error: error.message });

        res.status(201).json({
            message: 'Trip approved and activated. Safe journey!',
            request: data[0]
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/driver/vehicle/maintenance-history
// Returns full maintenance history for the driver's assigned vehicle
// ─────────────────────────────────────────────────────────────────────────────
exports.getMaintenanceHistory = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: profile, error: pErr } = await supabase
            .from('driver_profiles')
            .select('assigned_vehicle_id')
            .eq('user_id', userId)
            .single();

        if (pErr || !profile?.assigned_vehicle_id) {
            return res.json([]);
        }

        const { data, error } = await supabase
            .from('maintenance_orders')
            .select('id, title, description, priority, status, order_type, mechanic_name, scheduled_date, completed_date, estimated_cost, actual_cost')
            .eq('vehicle_id', profile.assigned_vehicle_id)
            .order('scheduled_date', { ascending: false })
            .limit(20);

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/driver/sos
// Creates a high-priority emergency SOS ticket and logs the alert
// ─────────────────────────────────────────────────────────────────────────────
exports.triggerSOS = async (req, res) => {
    try {
        const userId   = req.user.id;
        const { location } = req.body;

        const description = location
            ? `Driver has activated SOS. Reported location: ${location}`
            : 'Driver has activated SOS. GPS coordinates not available.';

        const { data, error } = await supabase
            .from('support_tickets')
            .insert([{
                driver_id:   userId,
                category:    'Emergency SOS',
                subject:     '🚨 SOS EMERGENCY ALERT',
                description,
                status:      'open',
                priority:    'high'
            }])
            .select();

        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json({
            message: 'SOS activated. Central Dispatch has been notified.',
            ticket:  data[0]
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
