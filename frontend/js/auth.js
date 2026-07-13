// Auth page logic

// On page load, check if user is already logged in
document.addEventListener('DOMContentLoaded', () => {
    // Check if URL has a recovery hash (Supabase password reset)
    if (window.location.hash && window.location.hash.includes('type=recovery')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        if (accessToken) {
            // Temporarily store the session so the user is authenticated for the update
            const session = { access_token: accessToken, refresh_token: refreshToken, expires_at: Math.floor(Date.now()/1000) + 3600 };
            localStorage.setItem('session', JSON.stringify(session));
            
            // Show update password form
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('signup-form').classList.add('hidden');
            document.getElementById('forgot-form').classList.add('hidden');
            document.getElementById('update-password-form').classList.remove('hidden');
            document.querySelector('.auth-tabs').classList.add('hidden');
            return;
        }
    }

    const session = localStorage.getItem('session');
    if (session) {
        try {
            const parsed = JSON.parse(session);
            // Check if the access token has expired
            if (parsed.expires_at) {
                const expiresAt = parsed.expires_at * 1000; // Supabase returns seconds
                const now = Date.now();
                const bufferMs = 60 * 1000; // 1 minute buffer

                if (now < expiresAt - bufferMs) {
                    // Token is still valid — go to dashboard
                    window.location.href = 'dashboard.html';
                    return;
                }

                // Token expired or about to expire — try refresh
                if (parsed.refresh_token) {
                    refreshAndRedirect(parsed.refresh_token);
                    return;
                }
            } else {
                // No expires_at — legacy session, just redirect
                window.location.href = 'dashboard.html';
                return;
            }
        } catch (e) {
            // Invalid session JSON — clear and stay on login
            localStorage.removeItem('session');
            localStorage.removeItem('user');
        }
    }
});

// Attempt to refresh the token and redirect to dashboard
async function refreshAndRedirect(refreshToken) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (response.ok) {
            const result = await response.json();
            localStorage.setItem('session', JSON.stringify(result.session));
            localStorage.setItem('user', JSON.stringify(result.user));
            window.location.href = 'dashboard.html';
        } else {
            // Refresh failed — clear session and stay on login
            localStorage.removeItem('session');
            localStorage.removeItem('user');
        }
    } catch (error) {
        // Network error — clear session
        localStorage.removeItem('session');
        localStorage.removeItem('user');
    }
}

// --- Tab Switching ---
function switchTab(tab) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const forgotForm = document.getElementById('forgot-form');
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');
    const indicator = document.getElementById('tab-indicator');
    const message = document.getElementById('auth-message');

    message.classList.add('hidden');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        forgotForm.classList.add('hidden');
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        indicator.classList.remove('signup');
        document.querySelector('.auth-tabs').classList.remove('hidden');
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        forgotForm.classList.add('hidden');
        loginTab.classList.remove('active');
        signupTab.classList.add('active');
        indicator.classList.add('signup');
        document.querySelector('.auth-tabs').classList.remove('hidden');
    }
}

// --- Show Forgot Password Form ---
function showForgotPassword(event) {
    if (event) event.preventDefault();
    
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.remove('hidden');
    
    // Hide the tabs while in forgot password mode
    document.querySelector('.auth-tabs').classList.add('hidden');
    
    document.getElementById('auth-message').classList.add('hidden');
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

    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });

        const result = await response.json();

        if (!response.ok) {
            showMessage(result.error || 'Login failed', 'error');
            setLoading('login-btn', false);
            return;
        }

        // Store full session (includes access_token, refresh_token, expires_at)
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

    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
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

// --- Handle Forgot Password ---
async function handleForgotPassword(event) {
    event.preventDefault();
    setLoading('forgot-btn', true);

    const email = document.getElementById('forgot-email').value.trim();

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const result = await response.json();

        if (!response.ok) {
            showMessage(result.error || 'Failed to send reset email', 'error');
            setLoading('forgot-btn', false);
            return;
        }

        showMessage('Password reset email sent! Please check your inbox.', 'success');
        setLoading('forgot-btn', false);
        
        // Clear the input
        document.getElementById('forgot-email').value = '';
    } catch (error) {
        showMessage('Network error. Is the backend server running?', 'error');
        setLoading('forgot-btn', false);
    }
}

// --- Handle Update Password ---
async function handleUpdatePassword(event) {
    event.preventDefault();
    setLoading('update-password-btn', true);

    const password = document.getElementById('update-password').value;
    const session = JSON.parse(localStorage.getItem('session'));

    if (!session || !session.access_token) {
        showMessage('Session expired. Please request a new reset link.', 'error');
        setLoading('update-password-btn', false);
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/update-password`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ password })
        });

        const result = await response.json();

        if (!response.ok) {
            showMessage(result.error || 'Failed to update password', 'error');
            setLoading('update-password-btn', false);
            return;
        }

        showMessage('Password updated successfully! Redirecting...', 'success');
        
        // Remove the hash from the URL
        history.replaceState(null, null, ' ');

        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
    } catch (error) {
        showMessage('Network error. Is the backend server running?', 'error');
        setLoading('update-password-btn', false);
    }
}
