(function initializeProfileSettings() {
  const profileForm = document.getElementById('profile-form');
  if (!profileForm) return;

  const passwordForm = document.getElementById('password-form');
  const fullName = document.getElementById('profile-full-name');
  const email = document.getElementById('profile-email');
  const currentPassword = document.getElementById('current-password');
  const newPassword = document.getElementById('new-password');
  const confirmPassword = document.getElementById('confirm-password');
  const saveProfile = document.getElementById('save-profile');
  const savePassword = document.getElementById('save-password');
  const message = document.getElementById('profile-message');

  function showMessage(text, type) {
    message.textContent = text;
    message.className = `business-alert business-alert--${type}`;
    message.hidden = false;
  }

  function clearMessage() {
    message.textContent = '';
    message.hidden = true;
  }

  function clearErrors(form) {
    form.querySelectorAll('.error-text').forEach((target) => {
      target.textContent = '';
    });
    form.querySelectorAll('[aria-invalid="true"]').forEach((input) => {
      input.removeAttribute('aria-invalid');
    });
  }

  function showErrors(details) {
    const targets = {
      currentPassword: [currentPassword, 'current-password-error'],
      fullName: [fullName, 'profile-full-name-error'],
      newPassword: [newPassword, 'new-password-error'],
    };

    Object.entries(details || {}).forEach(([field, text]) => {
      const target = targets[field];
      if (!target) return;
      target[0].setAttribute('aria-invalid', 'true');
      document.getElementById(target[1]).textContent = text;
    });
  }

  async function loadProfile() {
    profileForm.setAttribute('aria-busy', 'true');
    saveProfile.disabled = true;

    try {
      await window.BaytnaApi.getSession();
      const data = await window.BaytnaApi.request('/api/v1/store/account');
      fullName.value = data.account.fullName;
      email.value = data.account.email;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/');
        return;
      }
      showMessage(error.message, 'error');
    } finally {
      profileForm.removeAttribute('aria-busy');
      saveProfile.disabled = false;
    }
  }

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    clearErrors(profileForm);
    saveProfile.disabled = true;
    saveProfile.textContent = 'Saving…';

    try {
      const data = await window.BaytnaApi.request('/api/v1/store/account', {
        method: 'PUT',
        headers: window.BaytnaApi.csrfHeaders(),
        body: { fullName: fullName.value },
      });
      fullName.value = data.account.fullName;
      showMessage('Your name was saved.', 'success');
    } catch (error) {
      showErrors(error.details);
      showMessage(error.message, 'error');
    } finally {
      saveProfile.disabled = false;
      saveProfile.textContent = 'Save name';
    }
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    clearErrors(passwordForm);

    if (newPassword.value !== confirmPassword.value) {
      confirmPassword.setAttribute('aria-invalid', 'true');
      document.getElementById('confirm-password-error').textContent =
        'The new passwords do not match.';
      showMessage('Please correct the highlighted field.', 'error');
      return;
    }

    savePassword.disabled = true;
    savePassword.textContent = 'Changing…';

    try {
      await window.BaytnaApi.request('/api/v1/store/account/password', {
        method: 'POST',
        headers: window.BaytnaApi.csrfHeaders(),
        body: {
          currentPassword: currentPassword.value,
          newPassword: newPassword.value,
        },
      });
      passwordForm.reset();
      showMessage('Your password was changed.', 'success');
    } catch (error) {
      showErrors(error.details);
      showMessage(error.message, 'error');
    } finally {
      savePassword.disabled = false;
      savePassword.textContent = 'Change password';
    }
  });

  loadProfile();
})();
