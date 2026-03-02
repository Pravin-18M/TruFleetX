const supabase = require('../config/supabaseClient');

// Helper to generate ticket numbers
function generateTicketNumber() {
    return 'REQ-' + Math.floor(1000 + Math.random() * 9000);
}

// GET dispatch stats
exports.getDispatchStats = async (req, res) => {
    const [pendingRes, activeRes, criticalRes] = await Promise.all([
        supabase.from('dispatch_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('dispatch_requests').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('dispatch_requests').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('priority', 'high')
    ]);

    res.json({
        pendingRequests: pendingRes.count || 0,
        activeTrips:     activeRes.count  || 0,
        criticalDelays:  criticalRes.count || 0
    });
};

// GET pending dispatch requests
exports.getPendingRequests = async (req, res) => {
    const { data, error } = await supabase
        .from('dispatch_requests')
        .select('*, driver:users(full_name, email), vehicle:vehicles(make, model, registration_number, vin)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};

// GET active trips
exports.getActiveTrips = async (req, res) => {
    const { data, error } = await supabase
        .from('dispatch_requests')
        .select('*, driver:users(full_name, email), vehicle:vehicles(make, model, registration_number, vin)')
        .eq('status', 'active')
        .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};

// GET completed/history
exports.getHistory = async (req, res) => {
    const { data, error } = await supabase
        .from('dispatch_requests')
        .select('*, driver:users(full_name, email), vehicle:vehicles(make, model, registration_number, vin)')
        .in('status', ['completed', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};

// POST create dispatch request
exports.createRequest = async (req, res) => {
    const { origin, destination, cargo_type, cargo_weight, priority, driver_id, vehicle_id } = req.body;

    if (!origin || !destination) {
        return res.status(400).json({ error: 'Origin and destination are required.' });
    }

    const ticket_number = generateTicketNumber();

    const { data, error } = await supabase
        .from('dispatch_requests')
        .insert([{
            ticket_number,
            origin,
            destination,
            cargo_type,
            cargo_weight,
            priority: priority || 'standard',
            status: 'pending',
            driver_id: driver_id || null,
            vehicle_id: vehicle_id || null
        }])
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ message: 'Dispatch request created.', request: data[0] });
};

// PUT approve dispatch request
exports.approveRequest = async (req, res) => {
    const { requestId } = req.params;
    const { driver_id, vehicle_id } = req.body;

    const updates = { status: 'active', updated_at: new Date().toISOString() };
    if (driver_id)  updates.driver_id  = driver_id;
    if (vehicle_id) updates.vehicle_id = vehicle_id;

    const { data, error } = await supabase
        .from('dispatch_requests')
        .update(updates)
        .eq('id', requestId)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Request not found.' });

    res.json({ message: 'Dispatch approved and trip is now active.', request: data[0] });
};

// DELETE / reject dispatch request
exports.rejectRequest = async (req, res) => {
    const { requestId } = req.params;

    const { data, error } = await supabase
        .from('dispatch_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', requestId)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Request not found.' });

    res.json({ message: 'Dispatch request rejected.' });
};

// PUT complete a trip
exports.completeTrip = async (req, res) => {
    const { requestId } = req.params;

    const { data, error } = await supabase
        .from('dispatch_requests')
        .update({ status: 'completed', progress_pct: 100, updated_at: new Date().toISOString() })
        .eq('id', requestId)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Trip marked as completed.', request: data[0] });
};
