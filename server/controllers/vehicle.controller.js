const supabase = require('../config/supabaseClient');

// ─── Supabase Storage helper ───────────────────────────────────────────────────
const BUCKET = 'fleet-documents';

async function ensureBucket() {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets || buckets.find(b => b.name === BUCKET)) return;
    await supabase.storage.createBucket(BUCKET, { public: true });
}

async function uploadToStorage(remotePath, buffer, mimetype) {
    await ensureBucket();
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(remotePath, buffer, { contentType: mimetype, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(remotePath);
    return data.publicUrl;
}

// GET all vehicles
exports.getAllVehicles = async (req, res) => {
    const { data, error } = await supabase
        .from('vehicles')
        .select('*, insurance_policies(provider, policy_number, expiry_date)')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};

// GET single vehicle
exports.getVehicleById = async (req, res) => {
    const { vehicleId } = req.params;
    const { data, error } = await supabase
        .from('vehicles')
        .select('*, insurance_policies(provider, policy_number, expiry_date)')
        .eq('id', vehicleId)
        .single();

    if (error) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json(data);
};

// POST add vehicle — accepts multipart/form-data with optional rc_document + insurance_document files
exports.addVehicle = async (req, res) => {
    try {
        const {
            make, model, year, vin, registration_number, engine_number,
            insurance_provider, insurance_expiry, policy_number
        } = req.body;

        if (!make || !model || !year || !vin) {
            return res.status(400).json({ error: 'Make, model, year, and VIN are required.' });
        }

        // ── Upload RC document if provided ─────────────────────────────
        let rc_document_url = null;
        const rcFile = req.files?.rc_document?.[0];
        if (rcFile) {
            const ext = rcFile.originalname.split('.').pop().toLowerCase();
            rc_document_url = await uploadToStorage(
                `rc/${Date.now()}_${vin.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`,
                rcFile.buffer,
                rcFile.mimetype
            );
        }

        // ── Create the vehicle record ───────────────────────────────────
        const { data: vehicle, error: vErr } = await supabase
            .from('vehicles')
            .insert([{ make, model, year: parseInt(year), vin, registration_number,
                       engine_number, status: 'active', rc_document_url }])
            .select()
            .single();

        if (vErr) {
            if (vErr.code === '23505') return res.status(409).json({ error: 'A vehicle with this VIN or Registration Number already exists.' });
            return res.status(500).json({ error: vErr.message });
        }

        // ── Upload insurance document if provided ───────────────────────
        let insurance_document_url = null;
        const insFile = req.files?.insurance_document?.[0];
        if (insFile) {
            const ext = insFile.originalname.split('.').pop().toLowerCase();
            insurance_document_url = await uploadToStorage(
                `insurance/${Date.now()}_${vehicle.id}.${ext}`,
                insFile.buffer,
                insFile.mimetype
            );
        }

        // ── Create insurance policy if provider + expiry supplied ───────
        if (insurance_provider && insurance_expiry) {
            await supabase.from('insurance_policies').insert([{
                vehicle_id:    vehicle.id,
                provider:      insurance_provider,
                policy_number: policy_number || null,
                expiry_date:   insurance_expiry,
                document_url:  insurance_document_url
            }]);
        }

        res.status(201).json({ message: 'Vehicle registered successfully.', vehicle });
    } catch (err) {
        console.error('[addVehicle]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// PUT update vehicle status (block/unblock/maintenance)
exports.updateVehicleStatus = async (req, res) => {
    const { vehicleId } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['active', 'blocked', 'maintenance'];
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
    }

    const { data, error } = await supabase
        .from('vehicles')
        .update({ status })
        .eq('id', vehicleId)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Vehicle not found.' });

    res.json({ message: `Vehicle status updated to ${status}.`, vehicle: data[0] });
};

// PUT update vehicle details
exports.updateVehicle = async (req, res) => {
    const { vehicleId } = req.params;
    const updates = req.body;
    delete updates.id;

    const { data, error } = await supabase
        .from('vehicles')
        .update(updates)
        .eq('id', vehicleId)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Vehicle not found.' });

    res.json({ message: 'Vehicle updated successfully.', vehicle: data[0] });
};

// DELETE vehicle
exports.deleteVehicle = async (req, res) => {
    const { vehicleId } = req.params;
    const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', vehicleId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Vehicle removed from fleet.' });
};
