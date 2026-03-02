-- Create user roles ENUM type for data integrity
    CREATE TYPE user_role AS ENUM ('admin', 'manager', 'driver');

    -- Main Users Table
    CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        company_name TEXT,
        role user_role NOT NULL,
        is_approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        full_name TEXT,
        avatar_url TEXT
    );
    -- Security is enforced by the Express API layer (JWT + role middleware).
    -- Disable RLS so the backend service key can read/write freely.
    ALTER TABLE users DISABLE ROW LEVEL SECURITY;

    -- Vehicles Table
    CREATE TABLE vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        year INT NOT NULL,
        vin TEXT UNIQUE NOT NULL,
        registration_number TEXT UNIQUE,
        engine_number TEXT,
        status TEXT DEFAULT 'active', -- 'active', 'maintenance', 'blocked'
        rc_document_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;

    -- Insurance Policies Table
    CREATE TABLE insurance_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        policy_number TEXT NOT NULL,
        start_date DATE,
        expiry_date DATE NOT NULL,
        document_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE insurance_policies DISABLE ROW LEVEL SECURITY;

    -- Driver Profiles Table (extends users with role='driver')
    CREATE TABLE driver_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        phone TEXT,
        license_number TEXT,
        license_type TEXT DEFAULT 'HGMV',
        license_expiry DATE,
        safety_score INTEGER DEFAULT 100,
        miles_this_month NUMERIC DEFAULT 0,
        total_incidents INTEGER DEFAULT 0,
        years_experience INTEGER DEFAULT 0,
        assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
        status TEXT DEFAULT 'available', -- 'available', 'on-trip', 'off-duty'
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE driver_profiles DISABLE ROW LEVEL SECURITY;

    -- Dispatch Requests Table
    CREATE TABLE dispatch_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_number TEXT UNIQUE NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        cargo_type TEXT,
        cargo_weight TEXT,
        priority TEXT DEFAULT 'standard', -- 'high', 'standard'
        status TEXT DEFAULT 'pending', -- 'pending', 'active', 'completed', 'rejected'
        driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
        progress_pct INTEGER DEFAULT 0,
        eta TEXT,
        speed NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE dispatch_requests DISABLE ROW LEVEL SECURITY;

    -- Note: For a Fleet Admin to be created on first signup, you can manually create one
    -- or have a special "super-admin" role. As requested, the first 'admin' is auto-approved.

    -- SEQUENCE for auto-generating ticket numbers
    CREATE SEQUENCE dispatch_ticket_seq START 1000;

    -- ── Maintenance Orders Table (Manager Workflow) ─────────────────────────
    -- Tracks corrective repairs AND proactive service schedules.
    -- status flow: scheduled → in-service → awaiting-parts → ready → completed
    CREATE TABLE maintenance_orders (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id       UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        title            TEXT NOT NULL,
        description      TEXT,
        priority         TEXT DEFAULT 'medium',     -- 'high', 'medium', 'low'
        status           TEXT DEFAULT 'scheduled',  -- 'scheduled','in-service','awaiting-parts','ready','completed'
        order_type       TEXT DEFAULT 'corrective', -- 'corrective', 'proactive'
        mechanic_name    TEXT,
        scheduled_date   TIMESTAMPTZ,
        completed_date   TIMESTAMPTZ,
        estimated_cost   NUMERIC(12, 2),
        actual_cost      NUMERIC(12, 2),
        odometer_reading NUMERIC(10, 1),
        eta_parts        TEXT,                      -- e.g. '2 Days for Clutch Plate'
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE maintenance_orders DISABLE ROW LEVEL SECURITY;

    -- Optional: track vehicle fuel level (populated by drivers/IoT)
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_level INTEGER DEFAULT NULL;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_location TEXT DEFAULT NULL;

    -- ── Driver Portal Additions ──────────────────────────────────────────────
    -- Extra driver profile fields used by the driver portal
    ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS aadhar_number TEXT DEFAULT NULL;
    ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS medical_cert_expiry DATE DEFAULT NULL;
    ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL;
    ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS on_time_rate INTEGER DEFAULT 100;

    -- Vehicle registration certificate expiry (shown on Documents page)
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rc_expiry DATE DEFAULT NULL;

    -- ── Support Tickets Table ────────────────────────────────────────────────
    -- Raised by drivers; visible to managers/admins on fleet dashboard.
    -- Contains emergency SOS alerts (category = 'Emergency SOS') as well.
    CREATE TABLE IF NOT EXISTS support_tickets (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id   UUID REFERENCES users(id) ON DELETE CASCADE,
        category    TEXT DEFAULT 'Other',           -- 'Trip Issue','Vehicle Issue','Document Help','Emergency SOS','Other'
        subject     TEXT NOT NULL,
        description TEXT,
        status      TEXT DEFAULT 'open',            -- 'open','in-progress','resolved','closed'
        priority    TEXT DEFAULT 'medium',          -- 'high','medium','low'
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE support_tickets DISABLE ROW LEVEL SECURITY;