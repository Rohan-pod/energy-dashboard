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

// Admin client required for looking up users by username
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
app.post('/api/auth/signup', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
    }

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

    res.json({ message: 'Signup successful', user: data.user, session: data.session });
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email/Username and password are required' });
    }

    let emailToUse = identifier;

    // If identifier is a username (no @), look up their email using the Admin API
    if (!identifier.includes('@')) {
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Username login is not fully configured (missing service role key)' });
        }
        
        try {
            // In a real production app with many users, you should use a public profiles table.
            // For this project, we iterate over users via the admin API.
            const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
            if (listError) throw listError;

            const foundUser = users.find(u => u.user_metadata && u.user_metadata.username === identifier);
            if (!foundUser) {
                return res.status(401).json({ error: 'Invalid login credentials' });
            }
            emailToUse = foundUser.email;
        } catch (err) {
            console.error('Admin user lookup failed:', err);
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
// =====================

// GET /api/solar/readings?date=YYYY-MM-DD
app.get('/api/solar/readings', verifyAuth, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }

    const { data, error } = await supabase
        .from('solar_readings')
        .select('*')
        .gte('timestamp', `${date}T00:00:00`)
        .lt('timestamp', `${date}T23:59:59`)
        .order('timestamp', { ascending: true });

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ data });
});

// GET /api/solar/latest
app.get('/api/solar/latest', verifyAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('solar_readings')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ data });
});

// POST /api/solar/readings (for IoT devices to push data)
app.post('/api/solar/readings', verifyAuth, async (req, res) => {
    const { current, voltage, power, temperature } = req.body;

    if (current === undefined || voltage === undefined || power === undefined) {
        return res.status(400).json({ error: 'current, voltage, and power are required' });
    }

    const { data, error } = await supabase
        .from('solar_readings')
        .insert([{
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
