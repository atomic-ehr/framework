// Login form functionality
document.addEventListener('DOMContentLoaded', function() {
    initializeLoginForm();
    loadClientInfo();
    handleUrlParams();
});

function initializeLoginForm() {
    const form = document.getElementById('login-form');
    const usernameField = document.getElementById('username');
    const passwordField = document.getElementById('password');
    const loginButton = document.getElementById('login-button');
    const buttonText = document.querySelector('.button-text');
    const buttonSpinner = document.getElementById('button-spinner');

    // Extract session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    if (sessionId) {
        document.getElementById('session-id').value = sessionId;
    } else {
        showError('Missing session ID. Please restart the authentication flow.');
        return;
    }

    // Generate CSRF token (simple client-side approach)
    const csrfToken = generateCSRFToken();
    document.getElementById('csrf-token').value = csrfToken;

    // Form validation
    function validateForm() {
        const username = usernameField.value.trim();
        const password = passwordField.value;
        
        const isValid = username.length > 0 && password.length > 0;
        loginButton.disabled = !isValid;
        
        return isValid;
    }

    // Real-time validation
    usernameField.addEventListener('input', validateForm);
    passwordField.addEventListener('input', validateForm);

    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validateForm()) {
            showError('Please fill in all required fields.');
            return;
        }

        // Show loading state
        loginButton.disabled = true;
        buttonText.style.opacity = '0.7';
        buttonSpinner.style.display = 'block';
        hideError();

        try {
            const formData = new FormData(form);
            
            const response = await fetch('/auth/login', {
                method: 'POST',
                body: formData,
                credentials: 'same-origin'
            });

            const contentType = response.headers.get('content-type');
            
            if (response.ok) {
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    if (data.success) {
                        showSuccessAndRedirect();
                    } else {
                        throw new Error(data.message || 'Login failed');
                    }
                } else {
                    // Handle redirect response
                    window.location.href = response.url || '/auth/authorize';
                }
            } else {
                let errorMessage = 'Login failed';
                
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.error_description || errorData.error || errorMessage;
                }
                
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Login error:', error);
            showError(error.message || 'An unexpected error occurred. Please try again.');
        } finally {
            // Reset button state
            loginButton.disabled = false;
            buttonText.style.opacity = '1';
            buttonSpinner.style.display = 'none';
            validateForm(); // Re-validate to set correct disabled state
        }
    });

    // Enter key handling
    passwordField.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && validateForm()) {
            form.dispatchEvent(new Event('submit'));
        }
    });

    // Initial validation
    validateForm();
}

function loadClientInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    const clientName = urlParams.get('client_name');
    const clientNameElement = document.getElementById('client-name');
    
    if (clientName && clientNameElement) {
        clientNameElement.textContent = decodeURIComponent(clientName);
    } else {
        clientNameElement.textContent = 'the requesting application';
    }
}

function handleUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    
    if (error) {
        const message = errorDescription || getErrorMessage(error);
        showError(message);
        
        // Clean URL
        const url = new URL(window.location);
        url.searchParams.delete('error');
        url.searchParams.delete('error_description');
        window.history.replaceState({}, '', url);
    }
}

function getErrorMessage(errorCode) {
    const errorMessages = {
        'invalid_credentials': 'Invalid username or password',
        'account_disabled': 'Your account has been disabled',
        'too_many_attempts': 'Too many login attempts. Please try again later',
        'session_expired': 'Your session has expired. Please restart the login process',
        'invalid_session': 'Invalid session. Please restart the login process'
    };
    
    return errorMessages[errorCode] || 'An error occurred during login';
}

function togglePasswordVisibility() {
    const passwordField = document.getElementById('password');
    const toggleIcon = document.getElementById('password-toggle-icon');
    
    if (passwordField.type === 'password') {
        passwordField.type = 'text';
        toggleIcon.textContent = '🙈';
        toggleIcon.setAttribute('aria-label', 'Hide password');
    } else {
        passwordField.type = 'password';
        toggleIcon.textContent = '👁️';
        toggleIcon.setAttribute('aria-label', 'Show password');
    }
}

function showError(message) {
    const errorElement = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    
    errorText.textContent = message;
    errorElement.style.display = 'flex';
    
    // Scroll to error if needed
    errorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        hideError();
    }, 10000);
}

function hideError() {
    const errorElement = document.getElementById('error-message');
    errorElement.style.display = 'none';
}

function showSuccessAndRedirect() {
    const modal = document.getElementById('success-modal');
    modal.style.display = 'flex';
    
    // Redirect after animation completes
    setTimeout(() => {
        // Continue with authorization flow
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');
        
        if (sessionId) {
            // Redirect to authorize endpoint to complete the flow
            window.location.href = `/auth/authorize?session_id=${sessionId}`;
        } else {
            window.location.href = '/';
        }
    }, 3000);
}

function generateCSRFToken() {
    // Simple client-side CSRF token generation
    // In production, this should be generated server-side
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Accessibility enhancements
document.addEventListener('keydown', function(e) {
    // ESC to close modal
    if (e.key === 'Escape') {
        const modal = document.getElementById('success-modal');
        if (modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    }
});

// Handle focus trapping in modal
document.getElementById('success-modal').addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        // Simple focus trapping - in a real implementation, this would be more sophisticated
        e.preventDefault();
    }
});

// Security: Clear form on page unload
window.addEventListener('beforeunload', function() {
    const passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.value = '';
    }
});

// Prevent form resubmission on page refresh
if (window.history && window.history.replaceState) {
    window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
            window.location.reload();
        }
    });
}