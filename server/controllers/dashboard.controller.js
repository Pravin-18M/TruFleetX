const supabase = require('../config/supabaseClient');

// GET all dashboard KPI stats
exports.getStats = async (req, res) => {
    const today = new Date();
    const in7Days = new Date();
    in7Days.setDate(today.getDate() + 7);

    const todayStr = today.toISOString().split('T')[0];
    const in7DaysStr = in7Days.toISOString().split('T')[0];

    // Run all counts in parallel
    const [
        totalResult,
        activeResult,
        maintenanceResult,
        expiringResult
    ] = await Promise.all([
        supabase.from('vehicles').select('*', { count: 'exact', head: true }),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'maintenance'),
        supabase.from('insurance_policies')
            .select('*', { count: 'exact', head: true })
            .gte('expiry_date', todayStr)
            .lte('expiry_date', in7DaysStr)
    ]);

    res.json({
        totalVehicles:       totalResult.count       || 0,
        activeVehicles:      activeResult.count      || 0,
        maintenanceVehicles: maintenanceResult.count || 0,
        expiringPolicies:    expiringResult.count    || 0
    });
};
