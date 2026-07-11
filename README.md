# ☀️ Solar Energy Monitoring Dashboard

A full-stack web application for **real-time monitoring and analytics** of solar panel systems. IoT devices attached to solar panels push sensor data (current, voltage, power, temperature) to a cloud database, and users can visualize their data through an interactive dashboard.

## 🔑 Key Features

- **Multi-User Isolation** — Each user only sees their own solar panel data. User A never sees User B's readings.
- **Real-Time Monitoring** — Live display of current (A), voltage (V), power (W), and temperature (°C) with 30-second auto-refresh.
- **Accurate Energy Calculation** — Uses trapezoidal integration for precise Wh/kWh energy computation.
- **Interactive Charts** — Power generation timeline (line chart) and hourly energy distribution (bar chart) via Chart.js.
- **Daily Summary** — Total energy generated, peak output, and peak time for any selected date.
- **CSV Export** — Download raw sensor data as a CSV file.
- **Secure Authentication** — Email or username login, JWT token-based auth with automatic token refresh.
- **IoT Data Ingestion** — REST API endpoint for IoT devices to push sensor readings.

## 🏗️ Architecture

```
┌─────────────────────┐       ┌─────────────────────┐       ┌──────────────────┐
│   IoT Devices       │       │    Frontend          │       │    Backend API    │
│   (Solar Panels)    │──────▶│  (Static HTML/JS)    │──────▶│  (Node/Express)  │
│                     │       │  Hosted on Vercel    │       │  Hosted on Render│
└─────────────────────┘       └─────────────────────┘       └────────┬─────────┘
                                                                      │
                                                              ┌───────▼────────┐
                                                              │   Supabase     │
                                                              │  (PostgreSQL   │
                                                              │   + Auth)      │
                                                              └────────────────┘
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Vanilla CSS, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (JWT) |
| Charts | Chart.js |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- A [Supabase](https://supabase.com/) project (free tier works)

## 🚀 Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/Rohan-pod/energy-dashboard.git
cd energy-dashboard
```

### 2. Set Up Supabase Database

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Open **SQL Editor**
3. Paste the contents of `backend/supabase_setup.sql` and run it
4. This creates:
   - `profiles` table (for username lookups)
   - `solar_readings` table (with `user_id` for data isolation)
   - Row Level Security (RLS) policies
   - Auto-profile trigger on signup

### 3. Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=5000
FRONTEND_URL=http://localhost:8000
```

> Get these from **Supabase Dashboard → Settings → API**

### 4. Install & Run Backend

```bash
npm install
npm start
```

The backend runs on `http://localhost:5000`.

### 5. Configure Frontend

Edit `frontend/js/config.js` to point to your backend:

```javascript
const API_BASE_URL = 'http://localhost:5000';
```

### 6. Serve Frontend

You can use any static file server:

```bash
cd frontend
npx serve .
# or
python3 -m http.server 8000
```

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/signup` | ❌ | Create account (username + email + password) |
| `POST` | `/api/auth/login` | ❌ | Login by email or username |
| `POST` | `/api/auth/refresh` | ❌ | Refresh an expired access token |
| `POST` | `/api/auth/logout` | ✅ | Sign out |
| `GET` | `/api/auth/me` | ✅ | Get current user info |
| `GET` | `/api/solar/readings?date=YYYY-MM-DD` | ✅ | Get user's readings for a date |
| `GET` | `/api/solar/latest` | ✅ | Get user's most recent reading |
| `GET` | `/api/solar/summary?date=YYYY-MM-DD` | ✅ | Get daily energy summary (trapezoidal) |
| `POST` | `/api/solar/readings` | ✅ | Push a new reading (IoT ingestion) |
| `GET` | `/api/health` | ❌ | Health check |

## 🔌 IoT Integration

Your IoT device (e.g., ESP32, Raspberry Pi) should send data to the backend via HTTP POST:

```bash
curl -X POST https://your-backend-url/api/solar/readings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "current": 5.2,
    "voltage": 24.1,
    "power": 125.32,
    "temperature": 35.5
  }'
```

Each IoT device authenticates as a specific user, so readings are automatically associated with that user's account.

## 🔒 Multi-User Data Isolation

Data isolation is enforced at **two levels**:

1. **API Layer** — Every database query includes `.eq('user_id', req.user.id)`, filtering results to the authenticated user only.
2. **Database Layer (RLS)** — Supabase Row Level Security policies ensure that even direct database access is restricted to the user's own rows.

## 📁 Project Structure

```
energy-dashboard/
├── backend/
│   ├── server.js            # Express API server
│   ├── package.json         # Backend dependencies
│   ├── supabase_setup.sql   # Database migration SQL
│   ├── .env.example         # Environment variable template
│   └── .env                 # Your credentials (git-ignored)
├── frontend/
│   ├── index.html           # Login / Signup page
│   ├── dashboard.html       # Main dashboard page
│   ├── vercel.json          # Vercel SPA rewrite config
│   ├── css/
│   │   ├── auth.css         # Auth page styles
│   │   └── dashboard.css    # Dashboard styles
│   └── js/
│       ├── config.js        # API base URL
│       ├── auth.js          # Auth form logic
│       └── app.js           # Dashboard logic
├── .gitignore
└── README.md
```

## 📄 License

This project is currently in development.
