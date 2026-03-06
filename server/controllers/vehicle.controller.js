const supabase = require('../config/supabaseClient');
const { writeAudit } = require('./sysadmin.controller');

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
            insurance_provider, insurance_expiry, insurance_start_date, policy_number
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
            // policy_number is NOT NULL in schema — auto-generate if not supplied by admin
            const resolvedPolicyNo = (policy_number || '').trim() || `TRU-${vehicle.id.slice(-8).toUpperCase()}`;
            const { error: insErr } = await supabase.from('insurance_policies').insert([{
                vehicle_id:    vehicle.id,
                provider:      insurance_provider,
                policy_number: resolvedPolicyNo,
                start_date:    insurance_start_date || null,
                expiry_date:   insurance_expiry,
                document_url:  insurance_document_url
            }]);
            if (insErr) console.error('[addVehicle] insurance insert failed:', insErr.message);
        }

        res.status(201).json({ message: 'Vehicle registered successfully.', vehicle });

        // Audit after successful response
        writeAudit({
            type:        'VEHICLE_ADDED',
            severity:    'INFO',
            actorId:     req.user?.id,
            actorName:   req.user?.full_name || req.user?.email,
            actorRole:   req.user?.role,
            entityType:  'vehicle',
            entityId:    vehicle.id,
            entityLabel: `${make} ${model} (${registration_number || vin})`,
            details:     { make, model, year, vin, registration_number, had_insurance: !!(insurance_provider && insurance_expiry) }
        });
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

    writeAudit({
        type:        'VEHICLE_STATUS_CHANGED',
        severity:    status === 'blocked' ? 'WARNING' : 'INFO',
        actorId:     req.user?.id,
        actorName:   req.user?.full_name || req.user?.email,
        actorRole:   req.user?.role,
        entityType:  'vehicle',
        entityId:    vehicleId,
        entityLabel: `${data[0].make} ${data[0].model} (${data[0].registration_number || vehicleId.slice(-6)})`,
        details:     { new_status: status }
    });

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

// DELETE vehicle — requires a decommission reason for audit trail
exports.deleteVehicle = async (req, res) => {
    const { vehicleId } = req.params;

    // body.reason is primary; query param ?reason=X is fallback for edge cases
    const rawBody = req.body && typeof req.body === 'object' ? req.body : {};
    const reason  = (rawBody.reason || req.query.reason || '').toString().trim();
    const notes   = (rawBody.notes  || req.query.notes  || '').toString().trim();

    if (!reason) {
        return res.status(400).json({ error: 'A decommission reason is required. Please select one from the form.' });
    }

    // Fetch vehicle info before deletion for the audit record
    const { data: vehicle } = await supabase
        .from('vehicles')
        .select('make, model, registration_number, vin, status')
        .eq('id', vehicleId)
        .single();

    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });

    const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
    if (error) return res.status(500).json({ error: error.message });

    writeAudit({
        type:        'VEHICLE_DECOMMISSIONED',
        severity:    'CRITICAL',
        actorId:     req.user?.id,
        actorName:   req.user?.full_name || req.user?.email,
        actorRole:   req.user?.role,
        entityType:  'vehicle',
        entityId:    vehicleId,
        entityLabel: `${vehicle.make} ${vehicle.model} (${vehicle.registration_number || vehicle.vin})`,
        details:     {
            make:               vehicle.make,
            model:              vehicle.model,
            registration_number:vehicle.registration_number,
            vin:                vehicle.vin,
            last_status:        vehicle.status,
            decommission_reason:reason,
            notes:              notes || null
        }
    });

    res.json({
        message: `Vehicle ${vehicle.make} ${vehicle.model} (${vehicle.registration_number || vehicle.vin}) has been retired from the fleet registry.`,
        reason,
        audited: true
    });
};
