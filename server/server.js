require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// --- Middlewares ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve the static HTML/CSS/JS files from the 'public' directory
app.use(express.static('public'));

// --- API Routes ---
const authRoutes      = require('./routes/auth.routes');
const userRoutes      = require('./routes/user.routes');
const vehicleRoutes   = require('./routes/vehicle.routes');
const insuranceRoutes = require('./routes/insurance.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const driverRoutes    = require('./routes/driver.routes');
const dispatchRoutes  = require('./routes/dispatch.routes');
const managerRoutes      = require('./routes/manager.routes');
const driverPortalRoutes = require('./routes/driver_portal.routes');

app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/vehicles',  vehicleRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/drivers',   driverRoutes);
app.use('/api/dispatch',  dispatchRoutes);
app.use('/api/manager',   managerRoutes);
app.use('/api/driver',    driverPortalRoutes);


// --- Server Initialization ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[Trufleet CTO]: Server is running on port ${PORT}. Awaiting commands.`);
});

// --- Root Route to serve the landing page ---
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/Home.html');
});