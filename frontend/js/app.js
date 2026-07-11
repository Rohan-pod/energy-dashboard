// Solar Panel Energy Monitoring Dashboard - Main Application

// Global variables
let currentChart = null;
let powerTrendChart = null;
let selectedDate = new Date().toISOString().split('T')[0];
let authToken = null;
let refreshToken = null;
let isRefreshing = false;

// --- Auth Guard ---
function getSession() {
    const session = localStorage.getItem('session');
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    return JSON.parse(session);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const session = getSession();
    if (!session) return;

    authToken = session.access_token;
    refreshToken = session.refresh_token || null;

    // Display user name — show username from user_metadata
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const nameEl = document.getElementById('user-name');
    if (nameEl) {
        // Prefer username, then full_name, then email
        const displayName = user.user_metadata?.username
            || user.user_metadata?.full_name
            || user.email
            || '';
        nameEl.textContent = displayName;
    }

    // Schedule proactive token refresh
    scheduleTokenRefresh(session);

    initializeDashboard();
});

// --- Proactive Token Refresh ---
// Refreshes the token ~2 minutes before it expires, so the user never gets a 401
function scheduleTokenRefresh(session) {
    if (!session.expires_at || !session.refresh_token) return;

    const expiresAtMs = session.expires_at * 1000; // Supabase returns seconds
    const now = Date.now();
    const refreshInMs = expiresAtMs - now - (2 * 60 * 1000); // 2 min before expiry

    if (refreshInMs > 0) {
        setTimeout(async () => {
            await performTokenRefresh();
        }, refreshInMs);
    } else {
        // Token already near expiry — refresh immediately
        performTokenRefresh();
    }
}

// Perform the actual token refresh
async function performTokenRefresh() {
    if (isRefreshing || !refreshToken) return;
    isRefreshing = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (response.ok) {
            const result = await response.json();
            // Update stored session
            authToken = result.session.access_token;
            refreshToken = result.session.refresh_token;
            localStorage.setItem('session', JSON.stringify(result.session));
            localStorage.setItem('user', JSON.stringify(result.user));

            // Schedule next refresh
            scheduleTokenRefresh(result.session);
            console.log('Token refreshed successfully');
        } else {
            // Refresh failed — redirect to login
            console.error('Token refresh failed');
            handleLogout();
        }
    } catch (error) {
        console.error('Token refresh error:', error);
    } finally {
        isRefreshing = false;
    }
}

// --- API Helper ---
// Automatically retries with a refreshed token on 401
async function apiFetch(endpoint) {
    let response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        }
    });

    // If 401 (token expired), try refreshing and retry once
    if (response.status === 401 && refreshToken && !isRefreshing) {
        await performTokenRefresh();

        // Retry the original request with the new token
        if (authToken) {
            response = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });
        }

        // If still 401 after refresh, redirect to login
        if (response.status === 401) {
            handleLogout();
            return null;
        }
    } else if (response.status === 401) {
        handleLogout();
        return null;
    }

    return response.json();
}

// Main initialization
async function initializeDashboard() {
    try {
        const datePicker = document.getElementById('date-picker');
        datePicker.value = selectedDate;

        await loadDashboardData(selectedDate);
        setupEventListeners();
        startRealtimeMonitoring();
        hideLoadingSpinner();
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize dashboard');
        hideLoadingSpinner();
    }
}

// Event listeners
function setupEventListeners() {
    document.getElementById('date-picker').addEventListener('change', (e) => {
        selectedDate = e.target.value;
        loadDashboardData(selectedDate);
    });

    document.getElementById('today-btn').addEventListener('click', () => {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date-picker').value = today;
        selectedDate = today;
        loadDashboardData(selectedDate);
    });

    const downloadBtn = document.getElementById('download-csv');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', exportDataAsCSV);
    }
}

// Load dashboard data from backend API
async function loadDashboardData(dateString) {
    try {
        showLoadingSpinner();

        // Fetch readings and summary in parallel
        const [readingsResult, summaryResult] = await Promise.all([
            apiFetch(`/api/solar/readings?date=${dateString}`),
            apiFetch(`/api/solar/summary?date=${dateString}`)
        ]);

        if (!readingsResult || !readingsResult.data || readingsResult.data.length === 0) {
            clearDashboardData();
            showError(`No data available for ${dateString}`);
            hideLoadingSpinner();
            return;
        }

        const data = readingsResult.data;
        const latestReading = data[data.length - 1];

        updateLiveReadings(latestReading);
        updateDailySummary(summaryResult);
        updateCharts(data);
        updateDataTable(data);
        updateSystemStatus(latestReading);

        hideLoadingSpinner();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showError('Failed to load data from server');
        hideLoadingSpinner();
    }
}

// Update live readings cards
function updateLiveReadings(reading) {
    if (!reading) return;
    document.getElementById('current-value').textContent = (reading.current || 0).toFixed(2);
    document.getElementById('voltage-value').textContent = (reading.voltage || 0).toFixed(2);
    document.getElementById('power-value').textContent = (reading.power || 0).toFixed(2);
    document.getElementById('temperature-value').textContent = (reading.temperature || 0).toFixed(1);
}

// Update daily summary — uses backend-calculated trapezoidal energy
function updateDailySummary(summary) {
    if (!summary) return;

    const totalEnergyEl = document.getElementById('total-energy');
    const peakOutputEl = document.getElementById('peak-output');
    const peakTimeEl = document.getElementById('peak-time');

    if (totalEnergyEl) {
        // Display in Wh or kWh depending on magnitude
        const energyWh = summary.totalEnergy || 0;
        if (energyWh >= 1000) {
            totalEnergyEl.textContent = `${(energyWh / 1000).toFixed(2)} kWh`;
        } else {
            totalEnergyEl.textContent = `${energyWh.toFixed(2)} Wh`;
        }
    }

    if (peakOutputEl) {
        peakOutputEl.textContent = `${(summary.peakPower || 0).toFixed(2)} W`;
    }

    if (peakTimeEl) {
        if (summary.peakTime) {
            peakTimeEl.textContent = new Date(summary.peakTime).toLocaleTimeString();
        } else {
            peakTimeEl.textContent = '--';
        }
    }
}

// Clear dashboard when no data
function clearDashboardData() {
    document.getElementById('current-value').textContent = '--';
    document.getElementById('voltage-value').textContent = '--';
    document.getElementById('power-value').textContent = '--';
    document.getElementById('temperature-value').textContent = '--';
    document.getElementById('total-energy').textContent = '0 Wh';
    document.getElementById('peak-output').textContent = '0 W';
    document.getElementById('peak-time').textContent = '--';

    const tbody = document.getElementById('data-table-body');
    if (tbody) tbody.innerHTML = '';
}

// Update charts
function updateCharts(data) {
    if (!data || data.length === 0) return;

    const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
    const powerData = data.map(d => d.power || 0);
    const currentData = data.map(d => d.current || 0);

    updatePowerTrendChart(labels, powerData);
    updateCurrentChart(labels, currentData);
}

function updatePowerTrendChart(labels, data) {
    const ctx = document.getElementById('powerTrendChart');
    if (!ctx) return;

    if (powerTrendChart) {
        powerTrendChart.data.labels = labels;
        powerTrendChart.data.datasets[0].data = data;
        powerTrendChart.update();
    } else {
        powerTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Power Output (W)',
                    data: data,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#667eea'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: 'rgba(255,255,255,0.7)' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Power (W)', color: 'rgba(255,255,255,0.5)' },
                        ticks: { color: 'rgba(255,255,255,0.5)' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }
}

function updateCurrentChart(labels, data) {
    const ctx = document.getElementById('currentChart');
    if (!ctx) return;

    if (currentChart) {
        currentChart.data.labels = labels;
        currentChart.data.datasets[0].data = data;
        currentChart.update();
    } else {
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Current (A)',
                    data: data,
                    backgroundColor: 'rgba(118, 75, 162, 0.6)',
                    borderColor: '#764ba2',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: 'rgba(255,255,255,0.7)' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Current (A)', color: 'rgba(255,255,255,0.5)' },
                        ticks: { color: 'rgba(255,255,255,0.5)' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }
}

// Update data table
function updateDataTable(data) {
    const tbody = document.getElementById('data-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    data.forEach((reading, index) => {
        const row = document.createElement('tr');
        const timestamp = new Date(reading.timestamp);

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${timestamp.toLocaleString()}</td>
            <td>${(reading.current || 0).toFixed(2)} A</td>
            <td>${(reading.voltage || 0).toFixed(2)} V</td>
            <td>${(reading.power || 0).toFixed(2)} W</td>
            <td>${(reading.temperature || 0).toFixed(1)} °C</td>
        `;

        tbody.appendChild(row);
    });
}

// Real-time polling — refreshes every 30 seconds
function startRealtimeMonitoring() {
    setInterval(() => {
        loadDashboardData(selectedDate);
    }, 30000);
}

// Update system status
function updateSystemStatus(latestReading) {
    const statusBadge = document.getElementById('status-badge');
    if (!statusBadge) return;

    const isOperating = latestReading && latestReading.power && latestReading.power > 0;

    if (isOperating) {
        statusBadge.innerHTML = '<i class="fas fa-check-circle"></i> Operating Normally';
        statusBadge.className = 'status-badge operating';
    } else {
        statusBadge.innerHTML = '<i class="fas fa-exclamation-circle"></i> No Power Output';
        statusBadge.className = 'status-badge warning';
    }
}

// UI helpers
function showLoadingSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.remove('hidden');
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.add('hidden');
}

function showError(message) {
    console.error(message);
    const statusBadge = document.getElementById('status-badge');
    if (statusBadge) {
        statusBadge.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        statusBadge.className = 'status-badge error';
    }
}

// CSV export
function exportDataAsCSV() {
    try {
        const table = document.getElementById('data-table');
        if (!table) { showError('No data to export'); return; }

        let csv = 'Timestamp,Current (A),Voltage (V),Power (W),Temperature (°C)\n';
        const rows = table.querySelectorAll('tbody tr');

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const rowData = Array.from(cells).slice(1, 6).map(cell => cell.textContent).join(',');
            csv += rowData + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `solar_data_${selectedDate}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export error:', error);
        showError('Failed to export data');
    }
}

// Logout — clears all stored session data
function handleLogout() {
    localStorage.removeItem('session');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}
