const supabase = require('../config/supabaseClient');

// GET all dashboard KPI stats
exports.getStats = async (req, res) => {
    const today = new Date();
    const in7Days = new Date();
    in7Days.setDate(today.getDate() + 7);

    const todayStr    = today.toISOString().split('T')[0];
    const in7DaysStr  = in7Days.toISOString().split('T')[0];

    // Run all counts in parallel
    const [
        totalResult,
        activeVehiclesResult,
        maintenanceResult,
        expiringResult,
        totalDriversResult,
        activeTripsResult,
        pendingUsersResult
    ] = await Promise.all([
        supabase.from('vehicles').select('*', { count: 'exact', head: true }),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'maintenance'),
        supabase.from('insurance_policies')
            .select('*', { count: 'exact', head: true })
            .gte('expiry_date', todayStr)
            .lte('expiry_date', in7DaysStr),
        supabase.from('users').select('*', { count: 'exact', head: true })
            .eq('role', 'driver').eq('is_approved', true),
        supabase.from('dispatch_requests').select('*', { count: 'exact', head: true })
            .eq('status', 'active'),
        supabase.from('users').select('*', { count: 'exact', head: true })
            .eq('is_approved', false)
    ]);

    res.json({
        totalVehicles:       totalResult.count          || 0,
        activeVehicles:      activeVehiclesResult.count || 0,
        maintenanceVehicles: maintenanceResult.count    || 0,
        expiringPolicies:    expiringResult.count       || 0,
        totalDrivers:        totalDriversResult.count   || 0,
        activeTrips:         activeTripsResult.count    || 0,
        pendingApprovals:    pendingUsersResult.count   || 0
    });
};
