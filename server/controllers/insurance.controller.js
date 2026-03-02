const supabase = require('../config/supabaseClient');

// GET all policies (with vehicle data joined)
exports.getAllPolicies = async (req, res) => {
    const { data, error } = await supabase
        .from('insurance_policies')
        .select('*, vehicle:vehicles(make, model, vin, registration_number, status)')
        .order('expiry_date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};

// GET insurance KPI stats
exports.getInsuranceStats = async (req, res) => {
    const today = new Date();
    const in7Days = new Date();
    in7Days.setDate(today.getDate() + 7);

    const todayStr = today.toISOString().split('T')[0];
    const in7DaysStr = in7Days.toISOString().split('T')[0];

    // Count total vehicles
    const { count: totalVehicles } = await supabase
        .from('vehicles')
        .select('*', { count: 'exact', head: true });

    // Count policies that are active (not expired)
    const { count: activePolicies } = await supabase
        .from('insurance_policies')
        .select('*', { count: 'exact', head: true })
        .gte('expiry_date', todayStr);

    // Count expired / uninsured
    const { count: expiredCount } = await supabase
        .from('insurance_policies')
        .select('*', { count: 'exact', head: true })
        .lt('expiry_date', todayStr);

    // Count expiring in 7 days
    const { count: expiringIn7 } = await supabase
        .from('insurance_policies')
        .select('*', { count: 'exact', head: true })
        .gte('expiry_date', todayStr)
        .lte('expiry_date', in7DaysStr);

    const coveragePct = totalVehicles > 0
        ? ((activePolicies / totalVehicles) * 100).toFixed(1)
        : 0;

    res.json({
        coveragePercent: coveragePct,
        expiredOrUninsured: expiredCount || 0,
        expiringIn7Days: expiringIn7 || 0,
        activePolicies: activePolicies || 0
    });
};

// GET urgent policies (expired + expiring within 7 days)
exports.getUrgentPolicies = async (req, res) => {
    const today = new Date();
    const in7Days = new Date();
    in7Days.setDate(today.getDate() + 7);

    const todayStr = today.toISOString().split('T')[0];
    const in7DaysStr = in7Days.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('insurance_policies')
        .select('*, vehicle:vehicles(make, model, registration_number, vin)')
        .lte('expiry_date', in7DaysStr)
        .order('expiry_date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // Add days remaining and status
    const enriched = data.map(p => {
        const expiry = new Date(p.expiry_date);
        const diffMs = expiry - today;
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return { ...p, daysLeft, isExpired: daysLeft < 0 };
    });

    res.json(enriched);
};

// GET upcoming renewals (next 30 days) for dashboard table
exports.getUpcomingRenewals = async (req, res) => {
    const today = new Date();
    const in30Days = new Date();
    in30Days.setDate(today.getDate() + 30);

    const todayStr = today.toISOString().split('T')[0];
    const in30DaysStr = in30Days.toISOString().split('T')[0];

    const limit = parseInt(req.query.limit) || 10;

    const { data, error } = await supabase
        .from('insurance_policies')
        .select('*, vehicle:vehicles(make, model, registration_number, vin)')
        .lte('expiry_date', in30DaysStr)
        .order('expiry_date', { ascending: true })
        .limit(limit);

    if (error) return res.status(500).json({ error: error.message });

    const today2 = new Date();
    const enriched = data.map(p => {
        const expiry = new Date(p.expiry_date);
        const diffMs = expiry - today2;
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return { ...p, daysLeft, isExpired: daysLeft < 0 };
    });

    res.json(enriched);
};

// POST add policy
exports.addPolicy = async (req, res) => {
    const { vehicle_id, provider, policy_number, start_date, expiry_date } = req.body;

    if (!vehicle_id || !provider || !policy_number || !expiry_date) {
        return res.status(400).json({ error: 'vehicle_id, provider, policy_number, and expiry_date are required.' });
    }

    const { data, error } = await supabase
        .from('insurance_policies')
        .insert([{ vehicle_id, provider, policy_number, start_date, expiry_date }])
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ message: 'Insurance policy added.', policy: data[0] });
};

// PUT update / renew policy
exports.updatePolicy = async (req, res) => {
    const { policyId } = req.params;
    const updates = req.body;
    delete updates.id;

    const { data, error } = await supabase
        .from('insurance_policies')
        .update(updates)
        .eq('id', policyId)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Policy not found.' });

    res.json({ message: 'Policy updated successfully.', policy: data[0] });
};

// DELETE policy
exports.deletePolicy = async (req, res) => {
    const { policyId } = req.params;
    const { error } = await supabase
        .from('insurance_policies')
        .delete()
        .eq('id', policyId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Policy deleted.' });
};
