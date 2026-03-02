# TruFleetX — Complete Product & Technical Documentation


## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Strategy](#2-product-vision--strategy)
3. [User Roles & Personas](#3-user-roles--personas)
4. [Product Feature Modules](#4-product-feature-modules)
5. [Technical Architecture](#5-technical-architecture)
6. [Database Schema](#6-database-schema)
7. [Backend — Server & Entry Point](#7-backend--server--entry-point)
8. [API Reference](#8-api-reference)
9. [Controller Logic — Deep Dive](#9-controller-logic--deep-dive)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [File Storage](#11-file-storage)
12. [Frontend Pages](#12-frontend-pages)
13. [Security Architecture](#13-security-architecture)
14. [Infrastructure & Deployment](#14-infrastructure--deployment)
15. [Local Development Guide](#15-local-development-guide)
16. [Known Limitations & Future Roadmap](#16-known-limitations--future-roadmap)

---

## 1. Executive Summary

**TruFleetX** is a full-stack, cloud-native Fleet Management Platform built for logistics companies, transport operators, and enterprises that manage vehicle fleets at scale. It eliminates paper-based processes, spreadsheets, and disconnected tools by providing a single, role-aware web application that gives every stakeholder — from the Fleet Admin to a field Driver — exactly the information and controls they need.

### What Problem Does It Solve?

| Old World (Before TruFleetX) | New World (With TruFleetX) |
|---|---|
| Vehicle records in Excel sheets | Centralized searchable vehicle registry |
| Insurance renewal missed → fines | Automated 7-day and 30-day expiry alerts |
| Dispatcher calls drivers manually | Structured dispatch request lifecycle |
| Manager calls mechanic via WhatsApp | Kanban-style maintenance work-order board |
| Drivers carry paper trip sheets | Digital trip assignment and completion |
| Admin manually onboards users | Approval-gated self-service registration |
| No visibility into fleet status | Real-time KPI dashboard for every role |

### Core Value Propositions

- **Operational Efficiency** — Eliminate manual coordination across vehicles, drivers, and dispatches.
- **Compliance & Risk** — Never miss an insurance renewal or license expiry.
- **Role-Appropriate Access** — Each user type sees and does only what their role permits.
- **Scalability** — Serverless deployment on Firebase scales to zero at night and handles spikes without pre-provisioning.
- **Low TCO** — No servers to manage; estimated $0–$5/month at SME traffic levels.

---

## 2. Product Vision & Strategy

### Vision Statement

> *"Make fleet operations as simple as checking your phone — for every role, from the boardroom to the driver's seat."*

### Target Market

- **Primary:** Mid-size Indian logistics and transport companies (10–500 vehicles)
- **Secondary:** Enterprise internal fleets (manufacturing, FMCG, e-commerce last-mile)
- **Tertiary:** Government and municipal transport departments

### Competitive Differentiation

1. **India-First Design** — Hosted in Mumbai (`asia-south1`) for lowest latency. Supports HGMV license types, Aadhaar document tracking, and INR-denominated cost reporting.
2. **Serverless Economics** — Unlike legacy fleet software with per-seat pricing, TruFleetX runs on pay-per-invocation Firebase Cloud Functions.
3. **No Mobile App Required** — Fully responsive web application works on the driver's smartphone browser without app store friction.
4. **Zero External Dependencies for Core Logic** — Authentication, roles, and business logic are self-contained (JWT + bcrypt), with Supabase as the data layer.

---

## 3. User Roles & Personas

TruFleetX has three distinct role types enforced at both the API and UI layer.

### 3.1 Fleet Admin

**Who:** Fleet owner, operations head, or IT administrator.

**Capabilities:**
- Full read/write access across the entire system
- Approve or reject new user registration requests
- Register, update, block, and delete vehicles
- Manage all insurance policies
- View the master KPI dashboard
- Control dispatch requests (create, approve, reject, complete)
- Access all driver profiles and assign vehicles
- Manage account settings and passwords

**Access:** `Dasboard_admin.html`, `Vehicle_Management_admin.html`, `Insurance_admin.html`, `Driver_management_admin.html`, `Dispatch_Control_admin.html`, `User_Approval_admin.html`, `Setting_admin.html`

**Account Creation:** The **first admin** who registers is automatically approved (`is_approved = true`). All subsequent non-admin accounts require admin approval.

---

### 3.2 Fleet Manager

**Who:** Operations manager, fleet supervisor, branch manager.

**Capabilities:**
- View-only fleet inventory (vehicle status, assignments)
- Full maintenance work-order management (create, update, Kanban board)
- View dispatch activity feed and trip history
- Monitor driver roster and status
- Dashboard with trips-today, on-time rate, pending dispatches, maintenance count
- View fleet summary donut chart (on-road / idle / maintenance)

**Access:** `manager/Dashboard_manager.html`, `manager/Drivers_manager.html`, `manager/Maintenance_manager.html`, `manager/View_fleet_manager.html`

**Key Restriction:** Managers cannot register vehicles, approve users, or delete records. They are operational managers, not system administrators.

---

### 3.3 Driver

**Who:** Truck driver, delivery agent, hired driver.

**Capabilities:**
- View personal dashboard (safety score, total trips, mileage, on-time rate)
- See current active/pending trip assignment
- View upcoming and historical trips
- Check assigned vehicle status, fuel level, location, insurance, and next maintenance
- Access personal documents (driving license, Aadhaar details, medical certificate)
- Report vehicle mechanical issues (creates a maintenance order)
- Raise and track support tickets (including Emergency SOS)
- Mark active trips as completed

**Access:** `driver/dashboard_driver.html`, `driver/MyTrips_driver.html`, `driver/Vehicle_status_driver.html`, `driver/Documents_driver.html`, `driver/support_driver.html`

**Key Restriction:** Drivers can only see and act on their own data. No access to other drivers, vehicles not assigned to them, or admin functions.

---

## 4. Product Feature Modules

### 4.1 Authentication & User Onboarding

**Flow:**
1. New user visits `/signup.html` and submits email, password, company name, and desired role.
2. Password is salted and hashed with `bcrypt` (10 rounds) before storage.
3. `admin` role signup is **auto-approved**. All other roles (`manager`, `driver`) are set `is_approved = false`.
4. Pending users appear in the Admin's **User Approval** panel.
5. Admin approves → user can log in. Admin rejects → record is permanently deleted.
6. On login, server validates email + password + role match + approval status, then issues a **JWT** valid for 8 hours.
7. Token is stored in `localStorage` and sent with every subsequent API call as `Authorization: Bearer <token>`.

**Business Rule:** Role is self-declared at signup but enforced at login. A user who signs up as `manager` cannot log in as `admin` even with correct credentials.

---

### 4.2 Vehicle Management

**Data Captured per Vehicle:**
- Make, Model, Year, VIN (unique), Registration Number (unique), Engine Number
- Status: `active` | `blocked` | `maintenance` (computed `on-road` in manager view)
- RC Document (PDF/image, uploaded to Supabase Storage)
- RC Expiry Date
- Fuel Level (integer %, populated by drivers or IoT)
- Current Location (text, free-form)

**Operations:**
- **Add Vehicle** — Admin only. Supports simultaneous upload of RC document and insurance document (multipart form data, max 10MB per file).
- **View All** — Admin and Manager. Returns vehicles joined with their latest insurance policies.
- **Update Status** — Admin and Manager. Transition between `active`, `blocked`, `maintenance`.
- **Update Details** — Admin only.
- **Delete Vehicle** — Admin only. Cascades to insurance policies and maintenance orders.

**Insurance at Registration:** When adding a vehicle, the admin can optionally provide insurance provider, policy number, and expiry date in the same form. TruFleetX automatically creates the linked `insurance_policies` record.

---

### 4.3 Driver Management (Admin Side)

**Data Captured per Driver Profile:**
- Basic: Phone, License Number, License Type (HGMV default), License Expiry
- Documents: Aadhaar Number, Medical Certificate Expiry
- Performance: Safety Score (0–100), Miles This Month, Total Incidents, On-Time Rate, Years Experience
- Operational: Assigned Vehicle, Status (`available` | `on-trip` | `off-duty`)

**Operations:**
- View all approved drivers with their profiles and assigned vehicles
- Create or update driver profile (upsert by `user_id`)
- Update driver status
- View driver count KPIs

---

### 4.4 Dispatch & Trip Management

This is the operational heart of TruFleetX — the system that tracks every job from request to completion.

**Dispatch Request Lifecycle:**

```
[Created] → pending → active → completed
                  ↘ rejected
```

**Ticket Number:** Auto-generated as `REQ-XXXX` (random 4-digit suffix). Designed to be unique enough for operational reference.

**Fields per Dispatch Request:**
- Ticket Number, Origin, Destination
- Cargo Type, Cargo Weight
- Priority: `standard` | `high`
- Status: `pending` | `active` | `completed` | `rejected`
- Assigned Driver, Assigned Vehicle
- Progress Percentage (0–100)
- ETA, Speed

**Who Can Do What:**

| Action | Admin | Manager | Driver |
|---|---|---|---|
| Create request | ✅ | ✅ | ❌ |
| View pending | ✅ | ✅ | ❌ |
| Approve request | ✅ | ✅ | ❌ |
| Reject request | ✅ | ✅ | ❌ |
| Mark complete (admin side) | ✅ | ✅ | ❌ |
| Mark complete (own trip) | ❌ | ❌ | ✅ |
| View own trips | ❌ | ❌ | ✅ |

**Critical Detail:** When a driver marks a trip complete, their driver status is automatically reset to `available`.

---

### 4.5 Insurance Management

**Purpose:** Ensure every vehicle in the fleet has valid insurance at all times. Proactively alert before expiry.

**KPIs on Insurance Dashboard:**
- Total vehicles in fleet
- Coverage percentage (vehicles with active policy / total vehicles × 100)
- Expired or uninsured count (expired policies + vehicles with zero policy records)
- Expiring within 7 days (critical zone)
- Active policies count

**Urgent Alerts:** Any policy expiring within the next 7 days (or already expired) appears in the urgent panel with days remaining calculated and clearly flagged.

**Upcoming Renewals Table:** Policies expiring within the next 30 days, sorted ascending by expiry date.

**Operations:**
- Add new policy (linked to vehicle)
- Update/renew policy (change expiry, provider, policy number)
- View all policies with vehicle details joined

---

### 4.6 Maintenance Management (Manager Module)

**Purpose:** Track vehicle repairs and scheduled service with full Kanban workflow visibility.

**Work Order Types:**
- `corrective` — Unplanned repair triggered by breakdown or driver-reported issue
- `proactive` — Scheduled preventive maintenance (oil change, tyre rotation, etc.)

**Kanban Status Flow:**

```
scheduled → in-service → awaiting-parts → ready → completed
```

**Fields per Work Order:**
- Vehicle, Title, Description
- Priority: `high` | `medium` | `low`
- Assigned Mechanic Name
- Scheduled Date, Completed Date
- Estimated Cost, Actual Cost (in INR)
- Odometer Reading
- ETA for Parts (free text, e.g., "2 Days for Clutch Plate")

**Business Rule — Auto Status Link:**
- When a work order is created → vehicle status is set to `maintenance` (if currently `active`)
- When a work order is moved to `completed` → vehicle status is automatically reset to `active`

**Cost Analytics:** The maintenance dashboard provides a 6-month cost trend chart (aggregated `actual_cost` per calendar month, in ₹1,000 units).

**Driver-Reported Issues:** When a driver reports a vehicle issue via the Driver Portal:
- A `corrective` maintenance order is automatically created
- If priority is `high`, the vehicle is immediately moved to `maintenance` status, alerting the manager

---

### 4.7 Driver Self-Service Portal

The Driver Portal is a standalone section of the application accessible only to users with the `driver` role. It gives drivers everything they need without exposing administrative controls.

**Dashboard:**
- Safety Score (0–100, gamified driver behavior metric)
- Total completed trips
- Total distance driven (miles this month)
- On-time rate (percentage)
- Current trip status card (origin → destination, ticket number, progress)

**My Trips:**
- Upcoming tab: pending and active trips
- History tab: completed and rejected trips
- Each trip shows full routing, cargo details, vehicle registration, and priority badge

**Vehicle Status:**
- Assigned vehicle make/model/year/VIN
- Fuel level indicator
- Current location
- RC document link and RC expiry
- Insurance policy status and expiry
- Next scheduled maintenance

**My Documents:**
- Driving license: number, type, expiry
- Aadhaar reference number
- Medical certificate expiry
- Vehicle RC document download link
- Insurance policy document download link

**Support & Emergency:**
- Raise support tickets by category: Trip Issue, Vehicle Issue, Document Help, Emergency SOS, Other
- View all own tickets with status tracking
- Emergency contact list (all admins and managers in the system)

---

### 4.8 Admin KPI Dashboard

The admin dashboard provides a single-pane-of-glass view:

| KPI | Source |
|---|---|
| Total Vehicles | `vehicles` table count |
| Active Vehicles | `vehicles` where `status = active` |
| In Maintenance | `vehicles` where `status = maintenance` |
| Insurance Expiring (7 days) | `insurance_policies` between today and +7 days |
| Total Active Drivers | `users` where `role = driver` and `is_approved = true` |
| Active Trips | `dispatch_requests` where `status = active` |
| Pending Approvals | `users` where `is_approved = false` |

All 7 KPI queries are executed **in parallel** using `Promise.all` for maximum performance.

---

## 5. Technical Architecture

### High-Level Architecture

```
Browser (HTML + Vanilla JS)
        │
        │  HTTPS
        ▼
Firebase Hosting  ──── serves ────  server/public/** (all HTML pages)
        │
        │  /api/** rewrite
        ▼
Firebase Cloud Function  (asia-south1, 512MiB, 60s timeout)
   └── server/index.js  (Firebase Functions entry point)
          └── server/server.js  (Express.js application)
                 ├── routes/
                 ├── controllers/
                 ├── middleware/
                 └── config/supabaseClient.js
                            │
                            │  HTTPS REST API (service_role key)
                            ▼
                     Supabase (PostgreSQL)
                            +
                     Supabase Storage (fleet-documents bucket)
```

### Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JS | Zero-dependency, fast load, easy to maintain without build tools |
| Backend Runtime | Node.js 20 LTS | Long-term support, native `Promise`, compatible with Firebase Gen2 |
| Web Framework | Express.js 4.18 | Industry standard, minimal overhead, rich middleware ecosystem |
| Deployment — Hosting | Firebase Hosting | Global CDN, free SSL, custom domain, instant rollback |
| Deployment — API | Firebase Cloud Functions v2 | Serverless scale-to-zero, pay-per-use, native Express wrapping |
| Database | Supabase (PostgreSQL) | Managed Postgres, rich querying, Row Level Security available |
| File Storage | Supabase Storage | Co-located with DB, public URL generation, bucket-level access |
| Authentication | Custom JWT (jsonwebtoken) | Full control over token shape and expiry; no Firebase Auth dependency |
| Password Hashing | bcryptjs | Industry standard, salt rounds = 10 |
| File Uploads | Multer (memory storage) | Buffers file in RAM, streams to Supabase without temp disk I/O |

### Data Flow — Login to API Call

```
1. User submits login form  →  POST /api/auth/login
2. Server validates credentials, checks approval, verifies role
3. Server signs JWT (8h expiry) with { id, role, email, full_name }
4. Client stores JWT in localStorage
5. Every subsequent fetch() call adds header:  Authorization: Bearer <token>
6. auth.middleware.js verifies token → attaches req.user
7. authorize() middleware checks req.user.role against allowed roles
8. Controller executes business logic → queries Supabase via service_role key
9. JSON response returned to browser
```

---

## 6. Database Schema

### Tables Overview

| Table | Purpose |
|---|---|
| `users` | All system users (admin, manager, driver) with credentials and approval state |
| `vehicles` | Fleet vehicle registry |
| `insurance_policies` | Insurance records linked to vehicles |
| `driver_profiles` | Extended profile for driver-role users |
| `dispatch_requests` | Trip/job lifecycle tracking |
| `maintenance_orders` | Vehicle repair and service work orders |
| `support_tickets` | Driver-raised support issues and SOS alerts |

---

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `email` | TEXT UNIQUE | Login identifier |
| `password_hash` | TEXT | bcrypt hash, never returned in API responses |
| `company_name` | TEXT | Optional; for organizational reference |
| `role` | ENUM | `admin`, `manager`, `driver` |
| `is_approved` | BOOLEAN | `false` by default. Admins auto-approved. Others require admin action. |
| `full_name` | TEXT | Display name |
| `avatar_url` | TEXT | Profile picture URL |
| `created_at` | TIMESTAMPTZ | Auto |

---

### `vehicles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `make` | TEXT | e.g., Tata, Ashok Leyland |
| `model` | TEXT | e.g., Ace, 2518 |
| `year` | INT | Manufacturing year |
| `vin` | TEXT UNIQUE | Vehicle Identification Number |
| `registration_number` | TEXT UNIQUE | RTO registration plate |
| `engine_number` | TEXT | Optional |
| `status` | TEXT | `active`, `maintenance`, `blocked` |
| `rc_document_url` | TEXT | Supabase Storage public URL |
| `rc_expiry` | DATE | Registration certificate validity |
| `fuel_level` | INT | Percentage 0–100 |
| `current_location` | TEXT | Free-text location string |
| `created_at` | TIMESTAMPTZ | Auto |

---

### `insurance_policies`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `vehicle_id` | UUID FK → vehicles | Cascades on vehicle delete |
| `provider` | TEXT | Insurance company name |
| `policy_number` | TEXT | Policy reference |
| `start_date` | DATE | Optional coverage start |
| `expiry_date` | DATE | **Critical** — drives all renewal alerts |
| `document_url` | TEXT | Supabase Storage public URL for policy PDF |
| `created_at` | TIMESTAMPTZ | Auto |

---

### `driver_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `user_id` | UUID UNIQUE FK → users | One profile per driver user |
| `phone` | TEXT | Contact number |
| `license_number` | TEXT | Driving license reference |
| `license_type` | TEXT | Default `HGMV` (Heavy Goods Motor Vehicle) |
| `license_expiry` | DATE | Compliance tracking |
| `safety_score` | INT | 0–100; gamified performance metric |
| `miles_this_month` | NUMERIC | Distance driven current month |
| `total_incidents` | INT | Cumulative incident count |
| `on_time_rate` | INT | Percentage of trips completed on time |
| `years_experience` | INT | Driver experience |
| `assigned_vehicle_id` | UUID FK → vehicles | Current vehicle assignment (nullable) |
| `status` | TEXT | `available`, `on-trip`, `off-duty` |
| `aadhar_number` | TEXT | Indian national ID reference |
| `medical_cert_expiry` | DATE | Fitness certificate validity |
| `address` | TEXT | Driver address |
| `created_at` | TIMESTAMPTZ | Auto |

---

### `dispatch_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `ticket_number` | TEXT UNIQUE | `REQ-XXXX` format |
| `origin` | TEXT | Pickup location |
| `destination` | TEXT | Drop-off location |
| `cargo_type` | TEXT | Nature of goods |
| `cargo_weight` | TEXT | Free text (e.g., "5 tonnes") |
| `priority` | TEXT | `standard`, `high` |
| `status` | TEXT | `pending`, `active`, `completed`, `rejected` |
| `driver_id` | UUID FK → users | Assigned driver (nullable) |
| `vehicle_id` | UUID FK → vehicles | Assigned vehicle (nullable) |
| `progress_pct` | INT | 0–100 |
| `eta` | TEXT | Estimated arrival (free text) |
| `speed` | NUMERIC | Current speed |
| `created_at` | TIMESTAMPTZ | When request was raised |
| `updated_at` | TIMESTAMPTZ | Last status change |

---

### `maintenance_orders`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `vehicle_id` | UUID FK → vehicles | Cascades on vehicle delete |
| `title` | TEXT | Short description of work |
| `description` | TEXT | Detailed notes |
| `priority` | TEXT | `high`, `medium`, `low` |
| `status` | TEXT | `scheduled`, `in-service`, `awaiting-parts`, `ready`, `completed` |
| `order_type` | TEXT | `corrective`, `proactive` |
| `mechanic_name` | TEXT | Assigned mechanic |
| `scheduled_date` | TIMESTAMPTZ | Planned service date |
| `completed_date` | TIMESTAMPTZ | Actual completion timestamp |
| `estimated_cost` | NUMERIC(12,2) | Budget estimate in INR |
| `actual_cost` | NUMERIC(12,2) | Final cost in INR |
| `odometer_reading` | NUMERIC(10,1) | Kilometers at time of service |
| `eta_parts` | TEXT | Spare parts delivery ETA |
| `created_at` / `updated_at` | TIMESTAMPTZ | Audit trail |

---

### `support_tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `driver_id` | UUID FK → users | The driver who raised the ticket |
| `category` | TEXT | `Trip Issue`, `Vehicle Issue`, `Document Help`, `Emergency SOS`, `Other` |
| `subject` | TEXT | Short summary |
| `description` | TEXT | Full details |
| `status` | TEXT | `open`, `in-progress`, `resolved`, `closed` |
| `priority` | TEXT | `high`, `medium`, `low` |
| `created_at` / `updated_at` | TIMESTAMPTZ | Audit trail |

---

## 7. Backend — Server & Entry Point

### `server/server.js` — The Express Application

The Express application is the central engine. Key responsibilities:

1. **Middleware registration** — CORS, JSON body parser, URL-encoded body parser, static file server
2. **Static hosting** — Serves `server/public/**` for local development (`express.static`)
3. **Route mounting** — 9 route modules mounted under their respective `/api/*` prefixes
4. **Dual-mode execution:**
   - When imported by `index.js` (Cloud Functions): exports `app` only, does not start HTTP server
   - When run directly (`node server.js` / `npm run dev`): starts HTTP server on `PORT` env var or 3000

### `server/index.js` — Firebase Cloud Functions Entry Point

Wraps the Express app as a single Firebase Cloud Function named `api`.

**Global Cloud Function Configuration:**
- Region: `asia-south1` (Mumbai)
- Memory: 512 MiB
- Timeout: 60 seconds
- Min Instances: 0 (cold-start permitted; set to 1 for production zero-latency SLA)

**Why a single function?** Firebase Hosting rewrites `/api/**` → `api` function. All Express routes are handled within a single function invocation, keeping cold-start impact to one function and deployment simpler.

### `server/config/supabaseClient.js`

Creates and exports a singleton Supabase client using the `service_role` key. This key bypasses Row Level Security (RLS is explicitly disabled on all tables) and allows the backend to perform any read/write operation. 

**Important:** This is the correct pattern for a server-side application. The `service_role` key must **never** be exposed to the browser.

---

## 8. API Reference

All endpoints are prefixed with `/api`. All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

### Auth Routes — `/api/auth`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | `/api/auth/signup` | None | — | Register new user account |
| POST | `/api/auth/login` | None | — | Login and receive JWT token |

---

### User Routes — `/api/users`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/users/pending` | ✅ | admin | List all unapproved user requests |
| GET | `/api/users/approved` | ✅ | admin | List all approved users |
| PUT | `/api/users/approve/:userId` | ✅ | admin | Approve a pending user |
| DELETE | `/api/users/reject/:userId` | ✅ | admin | Reject and delete a pending request |
| PUT | `/api/users/profile` | ✅ | any | Update own name and avatar |
| PUT | `/api/users/password` | ✅ | any | Change own password (requires current password) |

---

### Vehicle Routes — `/api/vehicles`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/vehicles` | ✅ | admin, manager | List all vehicles with insurance join |
| GET | `/api/vehicles/:vehicleId` | ✅ | admin, manager | Single vehicle detail |
| POST | `/api/vehicles` | ✅ | admin | Register new vehicle (multipart with file uploads) |
| PUT | `/api/vehicles/:vehicleId/status` | ✅ | admin, manager | Update vehicle status |
| PUT | `/api/vehicles/:vehicleId` | ✅ | admin | Update vehicle details |
| DELETE | `/api/vehicles/:vehicleId` | ✅ | admin | Delete vehicle |

**File Upload Fields (POST):**
- `rc_document` — Registration Certificate (PDF or image, max 10MB)
- `insurance_document` — Insurance policy document (PDF or image, max 10MB)

---

### Insurance Routes — `/api/insurance`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/insurance` | ✅ | admin, manager | List all policies |
| GET | `/api/insurance/stats` | ✅ | admin, manager | Insurance KPI metrics |
| GET | `/api/insurance/urgent` | ✅ | admin, manager | Expired + expiring within 7 days |
| GET | `/api/insurance/renewals` | ✅ | admin, manager | Expiring within 30 days (query: `?limit=N`) |
| POST | `/api/insurance` | ✅ | admin, manager | Add new policy |
| PUT | `/api/insurance/:policyId` | ✅ | admin, manager | Update/renew policy |
| DELETE | `/api/insurance/:policyId` | ✅ | admin | Delete policy |

---

### Dashboard Routes — `/api/dashboard`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/dashboard/stats` | ✅ | admin, manager | 7 KPI counts fetched in parallel |

---

### Driver Routes — `/api/drivers` (Admin-side management)

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/drivers` | ✅ | admin, manager | All drivers with profiles |
| GET | `/api/drivers/stats` | ✅ | admin, manager | Total driver count |
| GET | `/api/drivers/:driverId` | ✅ | admin, manager | Single driver profile |
| POST/PUT | `/api/drivers/:driverId/profile` | ✅ | admin, manager | Upsert driver profile |
| PUT | `/api/drivers/:driverId/status` | ✅ | admin, manager | Update driver availability status |

---

### Dispatch Routes — `/api/dispatch`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/dispatch/stats` | ✅ | admin, manager | Pending, active, critical counts |
| GET | `/api/dispatch/pending` | ✅ | admin, manager | All pending requests |
| GET | `/api/dispatch/active` | ✅ | admin, manager | All active trips |
| GET | `/api/dispatch/history` | ✅ | admin, manager | Completed/rejected (last 50) |
| POST | `/api/dispatch` | ✅ | admin, manager | Create dispatch request |
| PUT | `/api/dispatch/approve/:requestId` | ✅ | admin, manager | Approve and activate |
| PUT | `/api/dispatch/complete/:requestId` | ✅ | admin, manager | Mark as completed |
| DELETE | `/api/dispatch/reject/:requestId` | ✅ | admin, manager | Reject request |

---

### Manager Routes — `/api/manager`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/manager/dashboard/stats` | ✅ | admin, manager | Manager KPI stats |
| GET | `/api/manager/fleet/summary` | ✅ | admin, manager | On-road / idle / maintenance donut data |
| GET | `/api/manager/fleet` | ✅ | admin, manager | Full fleet with computed status + driver assignment |
| GET | `/api/manager/maintenance` | ✅ | admin, manager | All work orders (filterable by status, type) |
| GET | `/api/manager/maintenance/stats` | ✅ | admin, manager | Vehicles in service, month cost |
| GET | `/api/manager/maintenance/cost-chart` | ✅ | admin, manager | 6-month cost trend |
| GET | `/api/manager/maintenance/proactive` | ✅ | admin, manager | Upcoming proactive orders |
| GET | `/api/manager/activity` | ✅ | admin, manager | Recent trip activity feed |
| POST | `/api/manager/maintenance` | ✅ | admin, manager | Create work order |
| PUT | `/api/manager/maintenance/:orderId/status` | ✅ | admin, manager | Advance Kanban status |

---

### Driver Portal Routes — `/api/driver`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/driver/me` | ✅ | driver | Own profile + assigned vehicle |
| GET | `/api/driver/current-trip` | ✅ | driver | Active or pending trip |
| GET | `/api/driver/trips` | ✅ | driver | Trips list (`?view=upcoming` or `?view=history`) |
| GET | `/api/driver/trips/stats` | ✅ | driver | Safety score, distance, on-time rate |
| PUT | `/api/driver/trips/:tripId/complete` | ✅ | driver | Mark own trip complete |
| GET | `/api/driver/vehicle` | ✅ | driver | Assigned vehicle + insurance + next maintenance |
| POST | `/api/driver/vehicle/issue` | ✅ | driver | Report mechanical issue → creates work order |
| GET | `/api/driver/documents` | ✅ | driver | License, Aadhaar, medical, vehicle documents |
| GET | `/api/driver/support/contacts` | ✅ | driver | All admin/manager emergency contacts |
| GET | `/api/driver/support/tickets` | ✅ | driver | Own support tickets |
| POST | `/api/driver/support/tickets` | ✅ | driver | Raise new support ticket |
| PUT | `/api/driver/support/tickets/:ticketId` | ✅ | driver | Update own ticket description/category |
| DELETE | `/api/driver/profile/update` | ✅ | driver | Update own driver profile fields |

---

## 9. Controller Logic — Deep Dive

### `auth.controller.js`

**`signup`**
- Validates required fields (email, password, role)
- Generates bcrypt salt (10 rounds), hashes password
- Auto-approves if role is `admin`, otherwise sets `is_approved = false`
- Handles duplicate email with specific `409 Conflict` response (detects Postgres unique constraint code `23505`)

**`login`**
- Queries user by email
- Compares submitted password against stored hash via `bcrypt.compare`
- Validates that the submitted role matches the stored role (prevents role spoofing)
- Validates `is_approved === true`
- Signs JWT with payload `{ id, role, email, full_name }`, 8-hour expiry

---

### `vehicle.controller.js`

**`addVehicle`**
Key orchestration:
1. Upload RC document → get public URL
2. Insert vehicle record
3. Upload insurance document → get public URL  
4. If insurance details provided → insert insurance policy record

All uploads use Supabase Storage with `upsert: true` to handle re-uploads gracefully. Files are stored under `rc/<timestamp>_<vin>.<ext>` and `insurance/<timestamp>_<vehicleId>.<ext>` paths.

---

### `dashboard.controller.js`

**`getStats`**
All 7 database queries run concurrently via `Promise.all`:
- Total vehicles
- Active vehicles
- Vehicles in maintenance
- Insurance policies expiring within 7 days
- Approved drivers
- Active trips
- Pending approvals

This pattern reduces total response time from sum-of-queries to max-of-queries.

---

### `insurance.controller.js`

**`getInsuranceStats`** — The most complex stats endpoint:
- Calculates "uninsured vehicles" by fetching all `vehicle_id` values from `insurance_policies`, de-duplicating with a `Set`, then subtracting from total vehicle count — correctly handles vehicles with no policy records at all.
- Coverage percentage: `(activePolicies / totalVehicles) × 100`

**`getUrgentPolicies`** — Enriches each policy with:
- `daysLeft`: `Math.ceil((expiryDate - now) / msPerDay)`
- `isExpired`: `daysLeft < 0`

---

### `manager.controller.js`

**`getManagerFleet`** — The most complex read endpoint in the system. Three parallel queries:
1. All vehicles
2. All active dispatch requests with driver info
3. All driver profiles with assigned vehicle + user name

Then builds two in-memory lookup maps (by vehicle ID) and merges:
- If vehicle has an active dispatch → `computed_status = 'on-road'`, attaches trip and driver name
- Otherwise marks as idle, maintenance, or blocked per base status

This avoids N+1 queries and computes derived state in application code rather than complex SQL.

**`updateOrderStatus`** — Includes business rule automation:
- On `completed`: sets `completed_date = now()` and reverts vehicle back to `active`

---

### `driver_portal.controller.js`

**`getMe`** — Single deeply-nested query fetching user → driver_profile → assigned_vehicle in one Supabase relational select.

**`completeMyTrip`** — Ownership verification before update: checks `existing.driver_id === userId` to prevent drivers from completing others' trips.

**`reportVehicleIssue`** — Maps user-friendly priority labels to system values:
- "Low - Can wait for next service" → `low`
- "Medium - Requires attention soon" → `medium`
- "High - Vehicle cannot drive" → `high`

High-priority issues auto-trigger vehicle status change to `maintenance`.

---

## 10. Authentication & Authorization

### Middleware — `auth.middleware.js`

**`authenticate`**
- Reads `Authorization` header
- Expects format: `Bearer <token>`
- Verifies token signature using `JWT_SECRET` environment variable
- Attaches decoded payload to `req.user`
- Returns `401` if no/malformed token, `400` if token invalid/expired

**`authorize(...roles)`**
- Higher-order function returning a middleware
- Checks `req.user.role` against the allowed roles array
- Returns `403 Forbidden` if role not permitted

**Usage Pattern in Routes:**
```javascript
router.post('/api/vehicles',
    authenticate,                  // Must be logged in
    authorize('admin'),            // Must be admin specifically
    upload.fields([...]),          // Multer file handling
    vehicleController.addVehicle   // Business logic
);
```

### JWT Token Structure

```json
{
  "id": "<user uuid>",
  "role": "admin | manager | driver",
  "email": "user@example.com",
  "full_name": "John Doe",
  "iat": 1700000000,
  "exp": 1700028800
}
```

**Token expiry:** 8 hours. No refresh token mechanism — users must re-login after expiry.

**Client-side storage:** `localStorage`. Token is lost on browser clear/logout. No server-side session management required.

---

## 11. File Storage

**Bucket:** `fleet-documents` in Supabase Storage  
**Access:** Public (files accessible via URL without auth)

**File Organization:**

| File Type | Storage Path |
|---|---|
| Vehicle RC Document | `rc/<timestamp>_<sanitized_vin>.<ext>` |
| Insurance Documents (at vehicle registration) | `insurance/<timestamp>_<vehicleId>.<ext>` |

**Upload Pipeline:**
1. Multer intercepts multipart form data, buffers file in server memory
2. Buffer passed to `uploadToStorage()` helper
3. Helper calls `supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true })`
4. On success, calls `getPublicUrl(path)` and returns the URL
5. URL stored in the relevant database column

**Size Limit:** 10MB per file (enforced by Multer before reaching the controller)

**`ensureBucket()`:** Called before every upload. Checks if bucket exists and creates it if not. Safe for fresh deployments.

---

## 12. Frontend Pages

The frontend is pure HTML/CSS/JavaScript — no framework, no build step. Every page fetches its data from the backend `/api/*` endpoints using the Fetch API.

### Authentication Pages

| File | Purpose |
|---|---|
| `home.html` | Public landing page |
| `login.html` | Role-aware login form (selects admin/manager/driver) |
| `signup.html` | Self-registration form |

### Admin Pages

| File | Purpose |
|---|---|
| `Dasboard_admin.html` | Main admin hub — 7-KPI grid, links to all modules |
| `Vehicle_Management_admin.html` | Vehicle registry — add, edit, status control, delete |
| `Insurance_admin.html` | Insurance overview — KPIs, urgent list, all policies |
| `Driver_management_admin.html` | Driver list — profiles, vehicle assignments, status |
| `Dispatch_Control_admin.html` | Trip control — create, approve, reject, complete |
| `User_Approval_admin.html` | Pending user requests — approve or reject |
| `Setting_admin.html` | Profile and password management |

### Manager Pages

| File | Purpose |
|---|---|
| `manager/Dashboard_manager.html` | Manager KPIs — trips today, on-time rate, pending, maintenance |
| `manager/View_fleet_manager.html` | Full fleet table with computed on-road/idle/maintenance status |
| `manager/Drivers_manager.html` | Driver roster viewer |
| `manager/Maintenance_manager.html` | Kanban maintenance board — create and advance work orders |

### Driver Portal Pages

| File | Purpose |
|---|---|
| `driver/dashboard_driver.html` | Safety score, trip stats, current trip card |
| `driver/MyTrips_driver.html` | Upcoming and historical trips with full details |
| `driver/Vehicle_status_driver.html` | Assigned vehicle — fuel, location, docs, maintenance |
| `driver/Documents_driver.html` | All documents — license, Aadhaar, medical, vehicle docs |
| `driver/support_driver.html` | Raise and track support tickets, emergency contacts |

### Client-Side Auth Guard

Each page checks for a valid JWT in `localStorage` on load. If absent, redirect to `login.html`. The `role` from the decoded JWT also guards navigation — a driver who manually navigates to an admin URL would get API `403` responses and be redirected.

---

## 13. Security Architecture

### Layered Security Model

```
Layer 1: Network       — HTTPS enforced by Firebase Hosting (no HTTP)
Layer 2: Headers       — X-Frame-Options, X-Content-Type-Options, Referrer-Policy set in firebase.json
Layer 3: Authentication — Every /api/* endpoint (except auth) requires valid JWT
Layer 4: Authorization  — Role-based middleware on every route
Layer 5: Data          — service_role key used server-side only; browser never sees Supabase credentials
Layer 6: Passwords     — bcrypt hash stored; plaintext never written to DB or logs
```

### HTTP Security Headers (from `firebase.json`)

All HTML pages are served with:
- `Cache-Control: no-cache` — Prevents sensitive pages from being cached in proxies
- `X-Frame-Options: DENY` — Prevents clickjacking via iframes
- `X-Content-Type-Options: nosniff` — Prevents MIME sniffing attacks
- `Referrer-Policy: strict-origin-when-cross-origin` — Controls referrer leakage

Static assets (JS/CSS) are served with a 1-year cache for performance.

### Secrets Management

| Secret | Local Dev | Production |
|---|---|---|
| `SUPABASE_URL` | `server/.env` | Firebase Secret Manager |
| `SUPABASE_KEY` (service_role) | `server/.env` | Firebase Secret Manager |
| `JWT_SECRET` | `server/.env` | Firebase Secret Manager |

The `.env` file is in `.gitignore` and must never be committed to version control.

### What is NOT Secret (Safe in Frontend)

The Firebase SDK configuration (`apiKey`, `projectId`, `appId`, etc.) is **intentionally public**. These values identify the Firebase project to the SDK but do not grant any backend access. Real security for Firebase resources is enforced by Firestore Security Rules and Firebase Auth — neither of which TruFleetX uses for data access (Supabase handles all data).

---

## 14. Infrastructure & Deployment

### Deployment Architecture

```
Firebase Hosting
  └── Serves: server/public/**
  └── CDN-cached, global edge nodes
  └── Auto-SSL, custom domain support

Firebase Cloud Functions (Asia South 1 — Mumbai)
  └── Function: api
  └── Handles: all /api/** requests
  └── Runtime: Node 20
  └── Memory: 512 MiB
  └── Timeout: 60s
  └── Min Instances: 0 (cold-start possible)

Supabase (PostgreSQL)
  └── Managed Postgres — no infrastructure to maintain
  └── 7 application tables
  └── fleet-documents storage bucket

```

### `firebase.json` Behavior

- `hosting.public` → `server/public` — all HTML served from this directory
- `hosting.rewrites` → `/api/**` proxied to Cloud Function `api` in `asia-south1`
- `functions.source` → `server` directory — everything in `server/` except `public/`, `.env`, `node_modules` is deployed as the function

### Deployment Commands

```bash
# Full deploy (hosting + functions)
firebase deploy

# Hosting only (HTML pages)
firebase deploy --only hosting

# Functions only (backend code)
firebase deploy --only functions
```

### Estimated Operating Costs (Low-Medium Traffic)

| Component | Cost |
|---|---|
| Firebase Hosting | Free (10GB storage, 360MB/day transfer on Spark; negligible on Blaze) |
| Cloud Functions | ~$0–2/month (2M invocations/month free, then $0.40/million) |
| Supabase | Free tier supports up to 500MB DB, 1GB storage |
| **Total** | **$0–$5/month** for typical SME fleet operation |

---

## 15. Local Development Guide

### Prerequisites

- Node.js 20+
- npm 9+
- A Supabase project with schema applied (see `server/schema.sql`)
- Firebase CLI: `npm install -g firebase-tools`

### Setup

```bash
# 1. Clone and install root dependencies
git clone <repo-url>
cd TruFleetX
npm install  # postinstall script auto-runs: cd server && npm install

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env and fill in:
#   SUPABASE_URL=<from Supabase Dashboard → Settings → API>
#   SUPABASE_KEY=<service_role key from Supabase Dashboard>
#   JWT_SECRET=<any long random string>
#   PORT=3000

# 3. Apply database schema
# Open Supabase Dashboard → SQL Editor → paste contents of server/schema.sql → Run

# 4. Start local development server
npm run dev
# → Server running on http://localhost:3000
# → Nodemon watches for file changes and auto-restarts

# 5. Access the app
# Open: http://localhost:3000/home.html
# Login: http://localhost:3000/login.html
```

### Create First Admin Account

1. Navigate to `/signup.html`
2. Enter email, password, company name
3. Select role: **Admin**
4. Click Register — admin accounts are auto-approved
5. Navigate to `/login.html`, select Admin, enter credentials

### Directory Structure & What Lives Where

```
TruFleetX/                    ← Root (Firebase project config)
├── firebase.json             ← Hosting + Functions config
├── .firebaserc               ← Project alias config
├── package.json              ← Root scripts (start, dev)
├── .gitignore                ← Excludes .env, service-account.json, etc.
└── server/                   ← All backend + frontend code
    ├── server.js             ← Express app definition
    ├── index.js              ← Firebase Functions entry point
    ├── package.json          ← Backend dependencies
    ├── schema.sql            ← Full database schema
    ├── .env                  ← Local secrets (NOT committed)
    ├── .env.example          ← Template with placeholder values
    ├── config/
    │   └── supabaseClient.js ← Supabase singleton client
    ├── middleware/
    │   └── auth.middleware.js← JWT auth + role guard
    ├── controllers/          ← Business logic (9 controllers)
    ├── routes/               ← Express routers (9 route files)
    └── public/               ← Frontend HTML pages
        ├── home.html
        ├── login.html
        ├── signup.html
        ├── Dasboard_admin.html
        ├── [... admin pages ...]
        ├── driver/           ← Driver portal pages
        └── manager/          ← Manager portal pages
```

---

## 16. Known Limitations & Future Roadmap

### Current Limitations

| Area | Limitation |
|---|---|
| JWT | No refresh token — users must re-login every 8 hours |
| Dispatch | Ticket number collision possible under high concurrency (random 4-digit suffix) |
| Driver Status | `on-trip` status not automatically set when dispatch is approved — requires manual update or UI handling |
| Fuel / Location | `fuel_level` and `current_location` are manual fields — no IoT or GPS integration |
| Notifications | No email/SMS/push notifications for insurance expiry, maintenance alerts, or approval status changes |
| Maintenance Cost | `avgDowntimeDays` is a hardcoded placeholder (`'3.2'`) — true downtime tracking not yet implemented |
| Multi-tenancy | All companies share the same database — no tenant isolation |
| Audit Log | No dedicated audit trail for who changed what and when |
| Password Reset | No "Forgot Password" flow — requires admin intervention |

### Recommended Near-Term Enhancements

1. **JWT Refresh Token** — Issue short-lived access tokens (15 min) + long-lived refresh tokens (7 days) stored in httpOnly cookies.
2. **Automated Notifications** — Integrate with a transactional email service (e.g., Resend, SendGrid) to email reminders for insurance renewals, pending approvals, and SOS alerts.
3. **Ticket Number Sequence** — Replace random `REQ-XXXX` with a proper PostgreSQL sequence for guaranteed uniqueness at scale.
4. **GPS Integration** — Connect vehicle `current_location` and `fuel_level` to a real-time IoT or telematics API.
5. **True Audit Log** — Add an `audit_log` table capturing `(user_id, action, table, record_id, old_value, new_value, timestamp)` on all write operations.
6. **Password Reset Flow** — Email-based OTP or magic link for self-service password recovery.
7. **Role: Super Admin** — A root-level account that can manage multiple company tenants.
8. **Mobile PWA** — Add a Web App Manifest and Service Worker to make the driver portal installable as a Progressive Web App for offline trip viewing.
9. **Reporting & Export** — PDF/CSV export for insurance renewal schedules, driver performance reports, and maintenance cost summaries.
10. **Downtime Tracking** — Calculate actual downtime by logging vehicle status transitions with timestamps and computing delta.

---

*Documentation generated by GitHub Copilot based on full codebase analysis. No sensitive credentials, API keys, or private configuration values are included in this document.*
