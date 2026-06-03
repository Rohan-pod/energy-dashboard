// Auth page logic

// On page load, check if user is already logged in
document.addEventListener('DOMContentLoaded', () => {
    const session = localStorage.getItem('session');
    if (session) {
        window.location.href = 'dashboard.html';
    }
});

// --- Tab Switching ---
function switchTab(tab) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');
    const indicator = document.getElementById('tab-indicator');
    const message = document.getElementById('auth-message');

    message.classList.add('hidden');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        indicator.classList.remove('signup');
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        loginTab.classList.remove('active');
        signupTab.classList.add('active');
        indicator.classList.add('signup');
    }
}

// --- Toggle Password Visibility ---
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// --- Show Message ---
function showMessage(text, type) {
    const message = document.getElementById('auth-message');
    message.textContent = text;
    message.className = `auth-message ${type}`;
}

// --- Set Loading State ---
function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');

    btn.disabled = loading;
    if (loading) {
        text.style.display = 'none';
        loader.classList.remove('hidden');
    } else {
        text.style.display = 'inline';
        loader.classList.add('hidden');
    }
}

// --- Handle Login ---
async function handleLogin(event) {
    event.preventDefault();
    setLoading('login-btn', true);

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (!response.ok) {
            showMessage(result.error || 'Login failed', 'error');
            setLoading('login-btn', false);
            return;
        }

        // Store session
        localStorage.setItem('session', JSON.stringify(result.session));
        localStorage.setItem('user', JSON.stringify(result.user));

        showMessage('Login successful! Redirecting...', 'success');

        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 800);
    } catch (error) {
        showMessage('Network error. Is the backend server running?', 'error');
        setLoading('login-btn', false);
    }
}

// --- Handle Signup ---
async function handleSignup(event) {
    event.preventDefault();
    setLoading('signup-btn', true);

    const fullName = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, fullName })
        });

        const result = await response.json();

        if (!response.ok) {
            showMessage(result.error || 'Signup failed', 'error');
            setLoading('signup-btn', false);
            return;
        }

        // If Supabase email confirmation is enabled
        if (result.session) {
            localStorage.setItem('session', JSON.stringify(result.session));
            localStorage.setItem('user', JSON.stringify(result.user));
            showMessage('Account created! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);
        } else {
            showMessage('Account created! Please check your email to confirm.', 'success');
            setLoading('signup-btn', false);
        }
    } catch (error) {
        showMessage('Network error. Is the backend server running?', 'error');
        setLoading('signup-btn', false);
    }
}
