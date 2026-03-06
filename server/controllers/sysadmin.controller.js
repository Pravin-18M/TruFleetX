/**
 * TRUFLEET — SYSTEM ADMINISTRATION CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Chief System Administrator Layer
 * Provides unconditional system insights: audit trail, user registry,
 * real-time DB telemetry, fleet intelligence.
 *
 * Architecture: In-memory circular ring buffer (500 entries) for audit events.
 * Events are written by all other controllers via writeAudit().
 * On server restart a "SYSTEM_START" event is emitted automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const supabase = require('../config/supabaseClient');

// ── AUDIT RING BUFFER ────────────────────────────────────────────────────────
const AUDIT_CAP  = 500;   // Max entries kept in memory
const _auditLog  = [];
let   _auditSeq  = 0;

/**
 * Write an audit event. Called by ALL controllers.
 * @param {object} event
 * @param {string} event.type          - e.g. 'VEHICLE_DECOMMISSIONED'
 * @param {string} [event.severity]    - 'INFO' | 'WARNING' | 'CRITICAL'
 * @param {string} [event.actorId]
 * @param {string} [event.actorName]
 * @param {string} [event.actorRole]
 * @param {string} [event.entityType]  - 'vehicle' | 'user' | 'dispatch' | 'auth'
 * @param {string} [event.entityId]
 * @param {string} [event.entityLabel] - Human-readable name
 * @param {object} [event.details]     - Any extra JSON-serialisable data
 */
exports.writeAudit = function writeAudit(event) {
    if (_auditLog.length >= AUDIT_CAP) _auditLog.shift();
    const entry = {
        seq:        ++_auditSeq,
        timestamp:  new Date().toISOString(),
        severity:   (event.severity || 'INFO').toUpperCase(),
        type:       event.type        || 'EVENT',
        actorId:    event.actorId     || null,
        actorName:  event.actorName   || 'System',
        actorRole:  event.actorRole   || 'system',
        entityType: event.entityType  || null,
        entityId:   event.entityId    || null,
        entityLabel:event.entityLabel || null,
        details:    event.details     || {}
    };
    _auditLog.push(entry);
    // Mirror to process stdout for traditional log aggregation
    process.stdout.write(`[AUDIT] ${entry.timestamp} [${entry.severity}] ${entry.type} by ${entry.actorName} | ${JSON.stringify(entry.details)}\n`);
};

// Boot event
exports.writeAudit({
    type:     'SYSTEM_START',
    severity: 'INFO',
    details:  { node_version: process.version, pid: process.pid, env: process.env.NODE_ENV || 'development' }
});

// ── GET AUDIT LOG ────────────────────────────────────────────────────────────
exports.getAuditLog = (req, res) => {
    const limit     = Math.min(parseInt(req.query.limit)  || 200, 500);
    const typeFilter= (req.query.type  || '').toUpperCase();
    const sevFilter = (req.query.sev   || '').toUpperCase();
    const search    = (req.query.q     || '').toLowerCase();

    let entries = [..._auditLog].reverse(); // newest first

    if (typeFilter) entries = entries.filter(e => e.type.includes(typeFilter));
    if (sevFilter)  entries = entries.filter(e => e.severity === sevFilter);
    if (search)     entries = entries.filter(e =>
        (e.entityLabel || '').toLowerCase().includes(search) ||
        (e.actorName   || '').toLowerCase().includes(search) ||
        (e.type        || '').toLowerCase().includes(search) ||
        JSON.stringify(e.details).toLowerCase().includes(search)
    );

    res.json({
        total:   _auditLog.length,
        cap:     AUDIT_CAP,
        seq:     _auditSeq,
        entries: entries.slice(0, limit)
    });
};

// ── SYSTEM OVERVIEW ──────────────────────────────────────────────────────────
exports.getOverview = async (req, res) => {
    try {
        const [
            { count: totalUsers },
            { count: approvedUsers },
            { count: pendingUsers },
            { count: totalVehicles },
            { count: activeVehicles },
            { count: maintenanceVehicles },
            { count: blockedVehicles },
            { count: activeTrips },
            { count: completedTrips },
            { count: totalPolicies },
            { count: driversCount },
            { count: managersCount },
            { count: openTickets },
        ] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_approved', true),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_approved', false),
            supabase.from('vehicles').select('*', { count: 'exact', head: true }),
            supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'maintenance'),
            supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'blocked'),
            supabase.from('dispatch_requests').select('*', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('dispatch_requests').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
            supabase.from('insurance_policies').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'driver'),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'manager'),
            supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        ]);

        res.json({
            users: {
                total: totalUsers || 0,
                approved: approvedUsers || 0,
                pending: pendingUsers || 0,
                drivers: driversCount || 0,
                managers: managersCount || 0,
                admins: Math.max(0, (approvedUsers || 0) - (driversCount || 0) - (managersCount || 0))
            },
            vehicles: {
                total:       totalVehicles      || 0,
                active:      activeVehicles     || 0,
                maintenance: maintenanceVehicles || 0,
                blocked:     blockedVehicles    || 0
            },
            trips: {
                active:    activeTrips    || 0,
                completed: completedTrips || 0
            },
            insurance: { total: totalPolicies || 0 },
            support:   { open: openTickets   || 0 },
            audit: {
                totalEvents: _auditSeq,
                bufferedEvents: _auditLog.length,
                bufferCap: AUDIT_CAP
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── ALL USERS (FULL REGISTRY) ─────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, full_name, company_name, role, is_approved, created_at, avatar_url')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── HARD DELETE USER (Chief Admin only) ──────────────────────────────────────
exports.deleteUser = async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body || {};

    if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: 'Deletion reason is required.' });
    }

    // Fetch before delete for audit
    const { data: target } = await supabase
        .from('users')
        .select('email, full_name, role')
        .eq('id', userId)
        .single();

    if (!target) return res.status(404).json({ error: 'User not found.' });

    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });

    exports.writeAudit({
        type:        'USER_HARD_DELETED',
        severity:    'CRITICAL',
        actorId:     req.user?.id,
        actorName:   req.user?.full_name || req.user?.email,
        actorRole:   req.user?.role,
        entityType:  'user',
        entityId:    userId,
        entityLabel: target.email,
        details:     { target_email: target.email, target_role: target.role, reason }
    });

    res.json({ message: `User ${target.email} permanently deleted.` });
};

// ── CHANGE USER ROLE ──────────────────────────────────────────────────────────
exports.changeUserRole = async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body || {};
    const allowed = ['admin', 'manager', 'driver'];

    if (!allowed.includes(role)) {
        return res.status(400).json({ error: `Role must be one of: ${allowed.join(', ')}` });
    }

    const { data: target } = await supabase.from('users').select('email, role').eq('id', userId).single();
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const { error } = await supabase.from('users').update({ role }).eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });

    exports.writeAudit({
        type:        'USER_ROLE_CHANGED',
        severity:    'WARNING',
        actorId:     req.user?.id,
        actorName:   req.user?.full_name || req.user?.email,
        actorRole:   req.user?.role,
        entityType:  'user',
        entityId:    userId,
        entityLabel: target.email,
        details:     { from: target.role, to: role }
    });

    res.json({ message: `Role updated to ${role}.` });
};

// ── TOGGLE USER APPROVAL ──────────────────────────────────────────────────────
exports.toggleUserApproval = async (req, res) => {
    const { userId } = req.params;
    const { is_approved } = req.body || {};

    const { data: target } = await supabase.from('users').select('email, role, is_approved').eq('id', userId).single();
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const newState = typeof is_approved === 'boolean' ? is_approved : !target.is_approved;

    const { error } = await supabase.from('users').update({ is_approved: newState }).eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });

    exports.writeAudit({
        type:        newState ? 'USER_APPROVED' : 'USER_REVOKED',
        severity:    'WARNING',
        actorId:     req.user?.id,
        actorName:   req.user?.full_name || req.user?.email,
        actorRole:   req.user?.role,
        entityType:  'user',
        entityId:    userId,
        entityLabel: target.email,
        details:     { new_state: newState }
    });

    res.json({ message: `User access ${newState ? 'approved' : 'revoked'}.`, is_approved: newState });
};

// ── DATABASE STATISTICS ───────────────────────────────────────────────────────
exports.getDbStats = async (req, res) => {
    try {
        const tables = [
            { key: 'users',             label: 'Users',              icon: 'fa-users' },
            { key: 'vehicles',          label: 'Vehicles',            icon: 'fa-truck' },
            { key: 'insurance_policies',label: 'Insurance Policies',  icon: 'fa-shield-halved' },
            { key: 'driver_profiles',   label: 'Driver Profiles',     icon: 'fa-id-card' },
            { key: 'dispatch_requests', label: 'Dispatch Requests',   icon: 'fa-route' },
            { key: 'maintenance_orders',label: 'Maintenance Orders',  icon: 'fa-screwdriver-wrench' },
            { key: 'support_tickets',   label: 'Support Tickets',     icon: 'fa-headset' },
        ];

        const counts = await Promise.all(
            tables.map(t =>
                supabase.from(t.key).select('*', { count: 'exact', head: true })
                    .then(r => ({ ...t, count: r.count || 0, error: r.error?.message || null }))
            )
        );

        res.json(counts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── RECENT FLEET ACTIVITY (from existing tables) ──────────────────────────────
exports.getFleetActivity = async (req, res) => {
    try {
        const [vehicles, trips, maintenance] = await Promise.all([
            supabase.from('vehicles')
                .select('id, make, model, registration_number, status, created_at')
                .order('created_at', { ascending: false }).limit(20),
            supabase.from('dispatch_requests')
                .select('id, ticket_number, origin, destination, status, priority, created_at, driver:users(full_name)')
                .order('created_at', { ascending: false }).limit(20),
            supabase.from('maintenance_orders')
                .select('id, title, status, priority, created_at, vehicle:vehicles(make, model, registration_number)')
                .order('created_at', { ascending: false }).limit(10),
        ]);

        res.json({
            recentVehicles:    vehicles.data    || [],
            recentTrips:       trips.data       || [],
            recentMaintenance: maintenance.data || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
