const supabase = require('../config/supabaseClient');

// ─── DASHBOARD STATS ────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStr = todayStart.toISOString();

        const [
            tripsTodayRes,
            completedTodayRes,
            pendingRes,
            maintenanceRes
        ] = await Promise.all([
            // Trips that were created or are active today
            supabase
                .from('dispatch_requests')
                .select('*', { count: 'exact', head: true })
                .in('status', ['active', 'completed'])
                .gte('created_at', todayStr),
            // Completed today for on-time rate approximation
            supabase
                .from('dispatch_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'completed')
                .gte('updated_at', todayStr),
            supabase
                .from('dispatch_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending'),
            supabase
                .from('vehicles')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'maintenance')
        ]);

        const tripsToday      = tripsTodayRes.count    || 0;
        const completedToday  = completedTodayRes.count || 0;
        const pendingDispatch = pendingRes.count         || 0;
        const inMaintenance   = maintenanceRes.count     || 0;

        // On-time rate: completedToday / tripsToday * 100 (fallback 100 if none)
        const onTimeRate = tripsToday > 0
            ? Math.round((completedToday / tripsToday) * 100)
            : 100;

        res.json({
            tripsToday,
            onTimeRate,
            pendingDispatch,
            vehiclesInMaintenance: inMaintenance
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch dashboard stats.' });
    }
};

// ─── FLEET SUMMARY for donut chart ─────────────────────────────────────────
exports.getFleetSummary = async (req, res) => {
    try {
        const [onRoadRes, idleRes, maintenanceRes] = await Promise.all([
            supabase.from('dispatch_requests').select('vehicle_id').eq('status', 'active'),
            supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'maintenance')
        ]);

        const onRoadIds    = (onRoadRes.data || []).map(r => r.vehicle_id).filter(Boolean);
        const onRoad       = onRoadIds.length;
        const totalActive  = idleRes.count || 0;
        const idle         = Math.max(0, totalActive - onRoad);
        const maintenance  = maintenanceRes.count || 0;

        res.json({ onRoad, idle, maintenance });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch fleet summary.' });
    }
};

// ─── FULL FLEET VIEW with computed trip/driver status ──────────────────────
exports.getManagerFleet = async (req, res) => {
    try {
        const [vehiclesRes, activeTripsRes, driverProfilesRes] = await Promise.all([
            supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
            supabase
                .from('dispatch_requests')
                .select('id, vehicle_id, driver_id, origin, destination, ticket_number, cargo_type, cargo_weight, driver:users!driver_id(full_name)')
                .eq('status', 'active'),
            supabase
                .from('driver_profiles')
                .select('assigned_vehicle_id, user_id, users!user_id(full_name)')
                .not('assigned_vehicle_id', 'is', null)
        ]);

        if (vehiclesRes.error) return res.status(500).json({ error: vehiclesRes.error.message });

        // Build lookup maps
        const activeByVehicle = {};
        (activeTripsRes.data || []).forEach(trip => {
            if (trip.vehicle_id) activeByVehicle[trip.vehicle_id] = trip;
        });

        const driverByVehicle = {};
        (driverProfilesRes.data || []).forEach(dp => {
            if (dp.assigned_vehicle_id) driverByVehicle[dp.assigned_vehicle_id] = dp;
        });

        const result = (vehiclesRes.data || []).map(v => {
            let computed_status = v.status; // 'active', 'maintenance', 'blocked'
            let current_trip    = null;
            let assigned_driver = null;

            if (v.status === 'active' && activeByVehicle[v.id]) {
                computed_status = 'on-road';
                current_trip    = activeByVehicle[v.id];
                assigned_driver = current_trip.driver ? current_trip.driver.full_name : null;
            }

            if (!assigned_driver && driverByVehicle[v.id]) {
                const dp = driverByVehicle[v.id];
                assigned_driver = dp.users ? dp.users.full_name : null;
            }

            return { ...v, computed_status, current_trip, assigned_driver };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch fleet.' });
    }
};

// ─── MAINTENANCE ORDERS ─────────────────────────────────────────────────────
exports.getMaintenanceOrders = async (req, res) => {
    try {
        const { status, order_type } = req.query;

        let query = supabase
            .from('maintenance_orders')
            .select('*, vehicle:vehicles(make, model, registration_number, status)')
            .order('created_at', { ascending: false });

        if (status)     query = query.eq('status', status);
        if (order_type) query = query.eq('order_type', order_type);

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch maintenance orders.' });
    }
};

// ─── MAINTENANCE STATS ──────────────────────────────────────────────────────
exports.getMaintenanceStats = async (req, res) => {
    try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [inServiceRes, completedThisMonthRes, costRes] = await Promise.all([
            supabase
                .from('maintenance_orders')
                .select('*', { count: 'exact', head: true })
                .in('status', ['scheduled', 'in-service', 'awaiting-parts']),
            supabase
                .from('maintenance_orders')
                .select('actual_cost')
                .eq('status', 'completed')
                .gte('completed_date', monthStart.toISOString()),
            supabase
                .from('maintenance_orders')
                .select('actual_cost, completed_date')
                .eq('status', 'completed')
                .gte('completed_date', monthStart.toISOString())
        ]);

        const inService       = inServiceRes.count || 0;
        const costData        = costRes.data || [];
        const monthCost       = costData.reduce((sum, r) => sum + (r.actual_cost || 0), 0);

        res.json({
            vehiclesInService: inService,
            avgDowntimeDays:   inService > 0 ? '3.2' : '0',   // placeholder until downtime tracking
            monthCost:         monthCost.toFixed(0)
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch maintenance stats.' });
    }
};

// ─── MAINTENANCE COST CHART — last 6 months ────────────────────────────────
exports.getMaintenanceCostChart = async (req, res) => {
    try {
        const results = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end  = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const label = d.toLocaleString('default', { month: 'short' });

            const { data } = await supabase
                .from('maintenance_orders')
                .select('actual_cost')
                .eq('status', 'completed')
                .gte('completed_date', d.toISOString())
                .lt('completed_date', end.toISOString());

            const total = (data || []).reduce((s, r) => s + (r.actual_cost || 0), 0);
            results.push({ month: label, cost: Math.round(total / 1000) }); // in ₹1000s
        }

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch cost chart data.' });
    }
};

// ─── CREATE MAINTENANCE ORDER ────────────────────────────────────────────────
exports.createMaintenanceOrder = async (req, res) => {
    try {
        const {
            vehicle_id, title, description, priority,
            order_type, mechanic_name, scheduled_date,
            estimated_cost, eta_parts, odometer_reading
        } = req.body;

        if (!vehicle_id || !title) {
            return res.status(400).json({ error: 'vehicle_id and title are required.' });
        }

        const { data, error } = await supabase
            .from('maintenance_orders')
            .insert([{
                vehicle_id,
                title,
                description:      description || null,
                priority:         priority    || 'medium',
                status:           'scheduled',
                order_type:       order_type  || 'corrective',
                mechanic_name:    mechanic_name    || null,
                scheduled_date:   scheduled_date   || null,
                estimated_cost:   estimated_cost   || null,
                eta_parts:        eta_parts         || null,
                odometer_reading: odometer_reading ? parseFloat(odometer_reading) : null
            }])
            .select('*, vehicle:vehicles(make, model, registration_number)');

        if (error) return res.status(500).json({ error: error.message });

        // If vehicle not already in maintenance, update its status
        await supabase
            .from('vehicles')
            .update({ status: 'maintenance' })
            .eq('id', vehicle_id)
            .eq('status', 'active');

        res.status(201).json({ message: 'Work order created.', order: data[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create work order.' });
    }
};

// ─── UPDATE KANBAN STATUS ────────────────────────────────────────────────────
exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status }  = req.body;

        const allowed = ['scheduled', 'in-service', 'awaiting-parts', 'ready', 'completed'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
        }

        const updates = { status, updated_at: new Date().toISOString() };
        if (status === 'completed') {
            updates.completed_date = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('maintenance_orders')
            .update(updates)
            .eq('id', orderId)
            .select('*, vehicle:vehicles(id, make, model, registration_number)');

        if (error) return res.status(500).json({ error: error.message });
        if (!data || data.length === 0) return res.status(404).json({ error: 'Order not found.' });

        // If completed, set vehicle back to active
        if (status === 'completed' && data[0].vehicle) {
            await supabase
                .from('vehicles')
                .update({ status: 'active' })
                .eq('id', data[0].vehicle.id);
        }

        res.json({ message: `Order status updated to ${status}.`, order: data[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update order status.' });
    }
};

// ─── PROACTIVE MAINTENANCE (vehicles in maintenance + high mileage) ─────────
exports.getProactiveMaintenance = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('maintenance_orders')
            .select('*, vehicle:vehicles(make, model, registration_number)')
            .eq('order_type', 'proactive')
            .in('status', ['scheduled', 'in-service'])
            .order('scheduled_date', { ascending: true })
            .limit(10);

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch proactive maintenance.' });
    }
};

// ─── RECENT ACTIVITY FEED ───────────────────────────────────────────────────
exports.getActivityFeed = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('dispatch_requests')
            .select('id, ticket_number, origin, destination, status, updated_at, vehicle:vehicles(registration_number, make), driver:users!driver_id(full_name)')
            .in('status', ['active', 'completed', 'rejected'])
            .order('updated_at', { ascending: false })
            .limit(10);

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch activity feed.' });
    }
};
