(function initializeAuthentication() {
  const form = document.getElementById('auth-form');
  const roleInput = document.getElementById('account-role');
  const modeInput = document.getElementById('auth-mode');
  const roleButtons = Array.from(document.querySelectorAll('[data-role]'));
  const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));
  const signupFields = Array.from(document.querySelectorAll('.signup-field'));
  const storeSignupField = document.querySelector('.store-signup-field');
  const fullNameInput = document.getElementById('full-name');
  const businessNameInput = document.getElementById('business-name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const termsInput = document.getElementById('terms');
  const fullNameError = document.getElementById('full-name-error');
  const businessNameError = document.getElementById('business-name-error');
  const emailError = document.getElementById('email-error');
  const passwordError = document.getElementById('password-error');
  const confirmPasswordError = document.getElementById('confirm-password-error');
  const termsError = document.getElementById('terms-error');
  const submitButton = document.getElementById('submit-button');
  const togglePassword = document.getElementById('toggle-password');
  const confirmPasswordToggle = document.querySelector('[data-password-target="confirm-password"]');
  const rememberOption = document.getElementById('remember-option');
  const forgotPassword = document.getElementById('forgot-password');
  const authTitle = document.getElementById('auth-title');
  const authDescription = document.getElementById('auth-description');

  if (!form) return;

  function updateSubmitLabel() {
    const role = roleInput.value;
    const mode = modeInput.value;

    if (mode === 'signup') {
      submitButton.textContent =
        role === 'store' ? 'Create store account' : 'Create customer account';
      return;
    }

    submitButton.textContent =
      role === 'store' ? 'Sign in to store dashboard' : 'Sign in as customer';
  }

  function setRole(role) {
    roleInput.value = role;

    roleButtons.forEach((button) => {
      const isActive = button.dataset.role === role;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    const needsBusinessName = modeInput.value === 'signup' && role === 'store';
    storeSignupField.hidden = !needsBusinessName;
    businessNameInput.required = needsBusinessName;
    updateSubmitLabel();
  }

  function setMode(mode) {
    const isSignup = mode === 'signup';
    modeInput.value = mode;

    modeButtons.forEach((button) => {
      const isActive = button.dataset.mode === mode;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    signupFields.forEach((field) => {
      field.hidden = !isSignup;
    });

    fullNameInput.required = isSignup;
    confirmPasswordInput.required = isSignup;
    termsInput.required = isSignup;
    rememberOption.hidden = isSignup;
    forgotPassword.hidden = isSignup;
    passwordInput.autocomplete = isSignup ? 'new-password' : 'current-password';
    authTitle.textContent = isSignup ? 'Create your account' : 'Welcome back';
    authDescription.textContent = isSignup
      ? 'Choose an account type and tell us a little about yourself.'
      : 'Choose how you use Baytna, then enter your details.';

    setRole(roleInput.value);
  }

  function clearError(input, errorElement) {
    input.removeAttribute('aria-invalid');
    errorElement.textContent = '';
  }

  function showError(input, errorElement, message) {
    input.setAttribute('aria-invalid', 'true');
    errorElement.textContent = message;
  }

  roleButtons.forEach((button) => {
    button.addEventListener('click', () => setRole(button.dataset.role));
  });

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  fullNameInput.addEventListener('input', () => clearError(fullNameInput, fullNameError));
  businessNameInput.addEventListener('input', () =>
    clearError(businessNameInput, businessNameError),
  );
  emailInput.addEventListener('input', () => clearError(emailInput, emailError));
  passwordInput.addEventListener('input', () => clearError(passwordInput, passwordError));
  confirmPasswordInput.addEventListener('input', () => {
    clearError(confirmPasswordInput, confirmPasswordError);
  });
  termsInput.addEventListener('change', () => {
    termsError.textContent = '';
  });

  function connectPasswordToggle(button, input, visibleLabel, hiddenLabel) {
    button.addEventListener('click', () => {
      const showingPassword = input.type === 'text';
      input.type = showingPassword ? 'password' : 'text';
      button.textContent = showingPassword ? 'Show' : 'Hide';
      button.setAttribute('aria-label', showingPassword ? visibleLabel : hiddenLabel);
    });
  }

  connectPasswordToggle(togglePassword, passwordInput, 'Show password', 'Hide password');
  connectPasswordToggle(
    confirmPasswordToggle,
    confirmPasswordInput,
    'Show confirmed password',
    'Hide confirmed password',
  );

  function applyServerErrors(error) {
    const details = error.details || {};
    const fieldMap = {
      businessName: [businessNameInput, businessNameError],
      email: [emailInput, emailError],
      fullName: [fullNameInput, fullNameError],
      password: [passwordInput, passwordError],
    };

    for (const [field, message] of Object.entries(details)) {
      const elements = fieldMap[field];
      if (elements) showError(elements[0], elements[1], message);
    }

    if (Object.keys(details).length === 0) {
      emailError.textContent = error.message || 'Unable to reach the server. Please try again.';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const isSignup = modeInput.value === 'signup';
    const isStoreSignup = isSignup && roleInput.value === 'store';

    clearError(fullNameInput, fullNameError);
    clearError(businessNameInput, businessNameError);
    clearError(emailInput, emailError);
    clearError(passwordInput, passwordError);
    clearError(confirmPasswordInput, confirmPasswordError);
    termsError.textContent = '';

    let isValid = true;

    if (isSignup && fullNameInput.value.trim().length < 2) {
      showError(fullNameInput, fullNameError, 'Enter your full name.');
      isValid = false;
    }

    if (isStoreSignup && businessNameInput.value.trim().length < 2) {
      showError(businessNameInput, businessNameError, 'Enter your business name.');
      isValid = false;
    }

    if (!emailInput.validity.valid) {
      showError(emailInput, emailError, 'Enter a valid email address.');
      isValid = false;
    }

    if (passwordInput.value.length < 8) {
      showError(passwordInput, passwordError, 'Password must be at least 8 characters.');
      isValid = false;
    }

    if (isSignup && confirmPasswordInput.value !== passwordInput.value) {
      showError(confirmPasswordInput, confirmPasswordError, 'Passwords do not match.');
      isValid = false;
    }

    if (isSignup && !termsInput.checked) {
      termsError.textContent = 'You must accept the terms to create an account.';
      isValid = false;
    }

    if (!isValid) return;

    const role = roleInput.value;

    if (role === 'store') {
      submitButton.disabled = true;
      submitButton.textContent = isSignup ? 'Creating account…' : 'Signing in…';

      try {
        const endpoint = isSignup ? '/api/v1/auth/store/register' : '/api/v1/auth/store/sign-in';
        const session = await window.BaytnaApi.request(endpoint, {
          method: 'POST',
          body: {
            businessName: businessNameInput.value.trim(),
            email: emailInput.value.trim(),
            fullName: fullNameInput.value.trim(),
            password: passwordInput.value,
          },
        });

        window.BaytnaApi.saveSession(session);
        window.location.assign('/pages/store/dashboard.html');
      } catch (error) {
        applyServerErrors(error);
        submitButton.disabled = false;
        updateSubmitLabel();
      }
      return;
    }

    sessionStorage.setItem(
      'baytnaDemoSession',
      JSON.stringify({
        role,
        email: emailInput.value.trim(),
        name: isSignup ? fullNameInput.value.trim() : '',
      }),
    );
    window.location.assign('/pages/stores.html');
  });

  setMode('signin');
})();
