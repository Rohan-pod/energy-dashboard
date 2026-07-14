require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Supabase Client ---
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Admin client for profile creation during signup
// (service_role key bypasses RLS — used only for controlled operations)
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;

// --- Middleware ---
app.use(express.json());
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// --- Auth Middleware ---
// Verifies JWT token and attaches user to request
async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
}

// =====================
//    AUTH ROUTES
// =====================

// POST /api/auth/signup
// Creates user account + profile row for efficient username lookups
app.post('/api/auth/signup', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check if username is already taken (query profiles table)
    if (supabaseAdmin) {
        const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('username', username)
            .single();

        if (existingProfile) {
            return res.status(400).json({ error: 'Username is already taken' });
        }
    }

    // Create the auth user
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password,
        options: {
            data: { username: username }
        }
    });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    // The Supabase trigger (handle_new_user) will auto-create the profile row.
    // As a fallback, also try to insert via the backend in case the trigger isn't set up yet.
    if (supabaseAdmin && data.user) {
        try {
            await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: data.user.id,
                    username: username,
                    email: email
                }, { onConflict: 'id' });
        } catch (profileErr) {
            // Non-fatal: the trigger may have already handled this
            console.warn('Profile upsert fallback:', profileErr.message);
        }
    }

    res.json({ message: 'Signup successful', user: data.user, session: data.session });
});

// POST /api/auth/login
// Supports login by email OR username
// FIX #1: Uses profiles table lookup instead of expensive listUsers() scan
app.post('/api/auth/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email/Username and password are required' });
    }

    let emailToUse = identifier;

    // If identifier is a username (no @), look up their email via profiles table
    if (!identifier.includes('@')) {
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Username login is not configured (missing service role key)' });
        }

        try {
            // O(1) indexed lookup on profiles table — replaces the old O(n) listUsers() scan
            const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('email')
                .eq('username', identifier)
                .single();

            if (profileError || !profile) {
                return res.status(401).json({ error: 'Invalid login credentials' });
            }

            emailToUse = profile.email;
        } catch (err) {
            console.error('Profile lookup failed:', err);
            return res.status(500).json({ error: 'Failed to look up username' });
        }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password
    });

    if (error) {
        return res.status(401).json({ error: error.message });
    }

    res.json({
        message: 'Login successful',
        user: data.user,
        session: data.session
    });
});

// POST /api/auth/refresh
// FIX #2: Token refresh endpoint — frontend calls this before access_token expires
app.post('/api/auth/refresh', async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({ error: 'refresh_token is required' });
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error) {
        return res.status(401).json({ error: error.message });
    }

    res.json({
        message: 'Token refreshed successfully',
        session: data.session,
        user: data.user
    });
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.FRONTEND_URL}/index.html?type=recovery` // Where to send the user after clicking email link
    });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Password reset email sent' });
});

// POST /api/auth/update-password
app.post('/api/auth/update-password', verifyAuth, async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'New password is required' });
    }

    if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Server misconfiguration: Service role key required for password update' });
    }

    // Use admin client to update the user since the global anon client has no session
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password: password });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Password updated successfully' });
});

// POST /api/auth/logout
app.post('/api/auth/logout', verifyAuth, async (req, res) => {
    const { error } = await supabase.auth.signOut();
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
app.get('/api/auth/me', verifyAuth, (req, res) => {
    res.json({ user: req.user });
});

// =====================
//    SOLAR DATA ROUTES
//    FIX #3: All queries filter by user_id for multi-user isolation
// =====================

// GET /api/solar/readings?date=YYYY-MM-DD
// Returns only the authenticated user's readings for the given date
app.get('/api/solar/readings', verifyAuth, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }

    const { data, error } = await supabase
        .from('solar_readings')
        .select('*')
        .eq('user_id', req.user.id)              // ← Multi-user isolation
        .gte('timestamp', `${date}T00:00:00`)
        .lt('timestamp', `${date}T23:59:59`)
        .order('timestamp', { ascending: true });

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ data });
});

// GET /api/solar/latest
// Returns only the authenticated user's most recent reading
app.get('/api/solar/latest', verifyAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('solar_readings')
        .select('*')
        .eq('user_id', req.user.id)              // ← Multi-user isolation
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ data });
});

// GET /api/solar/summary?date=YYYY-MM-DD
// FIX #4: Proper energy calculation using trapezoidal integration
// Returns: totalEnergy (Wh), peakPower (W), peakTime, avgPower (W), readingCount
app.get('/api/solar/summary', verifyAuth, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }

    const { data, error } = await supabase
        .from('solar_readings')
        .select('timestamp, power')
        .eq('user_id', req.user.id)
        .gte('timestamp', `${date}T00:00:00`)
        .lt('timestamp', `${date}T23:59:59`)
        .order('timestamp', { ascending: true });

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
        return res.json({
            totalEnergy: 0,
            peakPower: 0,
            peakTime: null,
            avgPower: 0,
            readingCount: 0
        });
    }

    // Trapezoidal integration for energy calculation
    // Energy (Wh) = Σ [(P_i + P_{i+1}) / 2 × Δt_hours]
    let totalEnergyWh = 0;
    let peakPower = 0;
    let peakTime = data[0].timestamp;

    for (let i = 0; i < data.length; i++) {
        const power = data[i].power || 0;

        // Track peak
        if (power > peakPower) {
            peakPower = power;
            peakTime = data[i].timestamp;
        }

        // Trapezoidal integration between consecutive readings
        if (i > 0) {
            const prevPower = data[i - 1].power || 0;
            const t1 = new Date(data[i - 1].timestamp).getTime();
            const t2 = new Date(data[i].timestamp).getTime();
            const deltaHours = (t2 - t1) / (1000 * 60 * 60); // ms → hours

            // Trapezoidal area: average of two consecutive power values × time interval
            totalEnergyWh += ((prevPower + power) / 2) * deltaHours;
        }
    }

    const avgPower = data.reduce((sum, r) => sum + (r.power || 0), 0) / data.length;

    res.json({
        totalEnergy: parseFloat(totalEnergyWh.toFixed(4)),
        peakPower: parseFloat(peakPower.toFixed(2)),
        peakTime: peakTime,
        avgPower: parseFloat(avgPower.toFixed(2)),
        readingCount: data.length
    });
});

// POST /api/solar/readings (for IoT devices to push data)
// Automatically associates the reading with the authenticated user
app.post('/api/solar/readings', verifyAuth, async (req, res) => {
    const { current, voltage, power, temperature } = req.body;

    if (current === undefined || voltage === undefined || power === undefined) {
        return res.status(400).json({ error: 'current, voltage, and power are required' });
    }

    const { data, error } = await supabase
        .from('solar_readings')
        .insert([{
            user_id: req.user.id,                // ← Multi-user isolation
            timestamp: new Date().toISOString(),
            current,
            voltage,
            power,
            temperature: temperature || 0
        }])
        .select();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: 'Reading inserted', data });
});

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
