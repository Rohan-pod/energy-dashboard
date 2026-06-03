// Solar Panel Energy Monitoring Dashboard - Main Application

// Global variables
let currentChart = null;
let powerTrendChart = null;
let selectedDate = new Date().toISOString().split('T')[0];
let authToken = null;

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

    // Display user name
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const nameEl = document.getElementById('user-name');
    if (nameEl) {
        nameEl.textContent = user.user_metadata?.full_name || user.email || '';
    }

    initializeDashboard();
});

// --- API Helper ---
async function apiFetch(endpoint) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (response.status === 401) {
        localStorage.removeItem('session');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
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

        const result = await apiFetch(`/api/solar/readings?date=${dateString}`);

        if (!result || !result.data || result.data.length === 0) {
            showError(`No data available for ${dateString}`);
            hideLoadingSpinner();
            return;
        }

        const data = result.data;
        const latestReading = data[data.length - 1];

        updateLiveReadings(latestReading);
        updateDailySummary(data);
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

// Update daily summary
function updateDailySummary(data) {
    if (!data || data.length === 0) return;

    const totalEnergy = data.reduce((sum, r) => sum + (r.power || 0), 0) / 1000;
    const peakReading = data.reduce((max, r) => (r.power || 0) > (max.power || 0) ? r : max);
    const peakTime = new Date(peakReading.timestamp).toLocaleTimeString();

    const elements = {
        'total-energy': `${totalEnergy.toFixed(2)} kWh`,
        'peak-output': `${(peakReading.power || 0).toFixed(2)} W`,
        'peak-time': peakTime
    };

    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
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

// Real-time polling
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

// Logout
function handleLogout() {
    localStorage.removeItem('session');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}
