const supabase = require('../config/supabaseClient');

// GET all approved drivers with their profiles
exports.getAllDrivers = async (req, res) => {
    const { data: drivers, error } = await supabase
        .from('users')
        .select(`
            id, email, full_name, avatar_url, created_at,
            driver_profiles (
                phone, license_number, license_type, license_expiry,
                safety_score, miles_this_month, total_incidents,
                years_experience, status,
                assigned_vehicle_id,
                vehicles!assigned_vehicle_id ( make, model, registration_number )
            )
        `)
        .eq('role', 'driver')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(drivers);
};

// GET single driver profile
exports.getDriverById = async (req, res) => {
    const { driverId } = req.params;

    const { data, error } = await supabase
        .from('users')
        .select(`
            id, email, full_name, avatar_url, created_at,
            driver_profiles (
                phone, license_number, license_type, license_expiry,
                safety_score, miles_this_month, total_incidents,
                years_experience, status,
                assigned_vehicle_id,
                vehicles!assigned_vehicle_id ( make, model, registration_number )
            )
        `)
        .eq('id', driverId)
        .eq('role', 'driver')
        .single();

    if (error) return res.status(404).json({ error: 'Driver not found.' });
    res.json(data);
};

// POST create or update driver profile
exports.upsertDriverProfile = async (req, res) => {
    const { driverId } = req.params;
    const { phone, license_number, license_type, license_expiry, years_experience, assigned_vehicle_id } = req.body;

    const { data, error } = await supabase
        .from('driver_profiles')
        .upsert([{
            user_id: driverId,
            phone, license_number, license_type, license_expiry,
            years_experience, assigned_vehicle_id
        }], { onConflict: 'user_id' })
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Driver profile updated.', profile: data[0] });
};

// PUT update driver status
exports.updateDriverStatus = async (req, res) => {
    const { driverId } = req.params;
    const { status } = req.body;

    const allowed = ['available', 'on-trip', 'off-duty'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const { data, error } = await supabase
        .from('driver_profiles')
        .update({ status })
        .eq('user_id', driverId)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Driver status updated.', profile: data[0] });
};

// GET driver count stats
exports.getDriverStats = async (req, res) => {
    const { count: totalDrivers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'driver')
        .eq('is_approved', true);

    res.json({ totalDrivers: totalDrivers || 0 });
};
