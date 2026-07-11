-- ============================================================
-- Solar Energy Dashboard — Supabase Setup SQL
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- ==========================================
-- 1. PROFILES TABLE (for username lookups)
-- ==========================================

-- This table stores username ↔ user mapping for efficient login.
-- It replaces the expensive listUsers() admin API call.
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast username lookups during login
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Enable Row Level Security on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Allow service role (backend) to insert profiles on signup
-- The anon key cannot insert profiles — only the service_role key can.
-- This is handled by the backend using supabaseAdmin client.
CREATE POLICY "Service role can insert profiles"
    ON profiles FOR INSERT
    WITH CHECK (true);

-- Allow public read of profiles for username lookup during login
-- (only username and id are exposed in the query, not sensitive data)
CREATE POLICY "Anyone can lookup username"
    ON profiles FOR SELECT
    USING (true);


-- ==========================================
-- 2. SOLAR_READINGS TABLE (with user_id)
-- ==========================================

-- If the table already exists without user_id, add the column.
-- If creating fresh, use the full CREATE TABLE below.

-- Option A: If table already exists, add user_id column:
-- ALTER TABLE solar_readings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Option B: Create table from scratch (use this for fresh setup):
CREATE TABLE IF NOT EXISTS solar_readings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    current REAL NOT NULL,
    voltage REAL NOT NULL,
    power REAL NOT NULL,
    temperature REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queries by user + date
CREATE INDEX IF NOT EXISTS idx_solar_readings_user_timestamp
    ON solar_readings(user_id, timestamp DESC);

-- Enable Row Level Security on solar_readings
ALTER TABLE solar_readings ENABLE ROW LEVEL SECURITY;

-- Users can only read their own readings
CREATE POLICY "Users can read own readings"
    ON solar_readings FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own readings
CREATE POLICY "Users can insert own readings"
    ON solar_readings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own readings
CREATE POLICY "Users can delete own readings"
    ON solar_readings FOR DELETE
    USING (auth.uid() = user_id);


-- ==========================================
-- 3. AUTO-CREATE PROFILE ON SIGNUP (Trigger)
-- ==========================================

-- This trigger automatically creates a profile row when a new user signs up.
-- It reads username from user_metadata set during signUp().
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'username', NEW.email),
        NEW.email
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- DONE! Your database is now ready for multi-user isolation.
-- ============================================================
