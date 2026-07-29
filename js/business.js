(function initializeBusinessProfile() {
  const form = document.getElementById('business-form');
  if (!form) return;

  const fields = {
    name: document.getElementById('business-name'),
    description: document.getElementById('business-description'),
    contactEmail: document.getElementById('contact-email'),
    phone: document.getElementById('phone'),
    addressLine: document.getElementById('address-line'),
    governorate: document.getElementById('governorate'),
    wilayat: document.getElementById('wilayat'),
    serviceAreas: document.getElementById('service-areas'),
    closureNote: document.getElementById('closure-note'),
  };
  const hoursRows = Array.from(document.querySelectorAll('[data-day]'));
  const temporarilyClosed = document.getElementById('temporarily-closed');
  const closureNoteField = document.getElementById('closure-note-field');
  const descriptionCount = document.getElementById('description-count');
  const message = document.getElementById('business-message');
  const saveButton = document.getElementById('save-business');
  const saveStatus = document.getElementById('save-status');
  const submitButton = document.getElementById('submit-application');
  const statusTitle = document.getElementById('application-status-title');
  const statusBadge = document.getElementById('application-status-badge');
  const statusDescription = document.getElementById('application-status-description');
  const statusReason = document.getElementById('application-status-reason');
  let currentBusiness;

  function setMessage(text, type) {
    message.textContent = text;
    message.className = `business-alert business-alert--${type}`;
    message.hidden = false;
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = '';
  }

  function clearErrors() {
    document.querySelectorAll('.error-text').forEach((element) => {
      element.textContent = '';
    });
    document.querySelectorAll('[aria-invalid="true"]').forEach((element) => {
      element.removeAttribute('aria-invalid');
    });
  }

  function showErrors(details) {
    const errorTargets = {
      name: ['business-name', 'business-name-error'],
      description: ['business-description', 'business-description-error'],
      contactEmail: ['contact-email', 'contact-email-error'],
      phone: ['phone', 'phone-error'],
      addressLine: ['address-line', 'address-line-error'],
      governorate: ['governorate', 'governorate-error'],
      wilayat: ['wilayat', 'wilayat-error'],
      serviceAreas: ['service-areas', 'service-areas-error'],
      hours: [null, 'hours-error'],
      closureNote: ['closure-note', 'closure-note-error'],
      business: [null, 'hours-error'],
    };

    for (const [field, text] of Object.entries(details || {})) {
      const target = errorTargets[field];
      if (!target) continue;

      if (target[0]) document.getElementById(target[0]).setAttribute('aria-invalid', 'true');
      document.getElementById(target[1]).textContent = text;
    }
  }

  function updateDescriptionCount() {
    descriptionCount.textContent = `${fields.description.value.length} / 1000`;
  }

  function updateClosureField() {
    closureNoteField.hidden = !temporarilyClosed.checked;
  }

  function updateHoursRow(row) {
    const isClosed = row.querySelector('[data-hours-closed]').checked;
    const openInput = row.querySelector('[data-hours-open]');
    const closeInput = row.querySelector('[data-hours-close]');
    openInput.disabled = isClosed;
    closeInput.disabled = isClosed;
    openInput.required = !isClosed;
    closeInput.required = !isClosed;
  }

  function updateStatus(business) {
    const labels = {
      draft: 'Draft',
      pending: 'Pending review',
      approved: 'Approved',
      rejected: 'Changes requested',
      suspended: 'Suspended',
    };
    const descriptions = {
      draft: business.completeness.isComplete
        ? 'Your profile is complete and ready to submit.'
        : `Complete: ${business.completeness.missingFields.join(', ')}.`,
      pending: 'Baytna is reviewing your business information.',
      approved: 'Your business is approved and can operate on Baytna.',
      rejected: 'Update the requested information, save it, and submit again.',
      suspended: 'Your business is currently suspended. Contact Baytna support for help.',
    };

    statusTitle.textContent = business.name;
    statusBadge.textContent = labels[business.applicationStatus];
    statusBadge.dataset.status = business.applicationStatus;
    statusDescription.textContent = descriptions[business.applicationStatus];
    statusReason.textContent = business.statusReason;
    statusReason.hidden = !business.statusReason;
    submitButton.disabled =
      !business.completeness.isComplete ||
      !['draft', 'rejected'].includes(business.applicationStatus);
  }

  function populateForm(business) {
    currentBusiness = business;
    fields.name.value = business.name;
    fields.description.value = business.description;
    fields.contactEmail.value = business.contactEmail;
    fields.phone.value = business.phone;
    fields.addressLine.value = business.addressLine;
    fields.governorate.value = business.governorate;
    fields.wilayat.value = business.wilayat;
    fields.serviceAreas.value = business.serviceAreas.join(', ');
    fields.closureNote.value = business.closureNote;
    temporarilyClosed.checked = business.isTemporarilyClosed;

    for (const row of hoursRows) {
      const day = Number(row.dataset.day);
      const hours = business.hours.find((entry) => entry.dayOfWeek === day);
      const closedInput = row.querySelector('[data-hours-closed]');
      const openInput = row.querySelector('[data-hours-open]');
      const closeInput = row.querySelector('[data-hours-close]');
      closedInput.checked = hours?.isClosed ?? true;
      openInput.value = hours?.opensAt || '08:00';
      closeInput.value = hours?.closesAt || '18:00';
      updateHoursRow(row);
    }

    updateDescriptionCount();
    updateClosureField();
    updateStatus(business);
    form.removeAttribute('aria-busy');
    Array.from(form.elements).forEach((element) => {
      element.disabled = element.matches('[data-hours-open], [data-hours-close]')
        ? element.closest('[data-day]').querySelector('[data-hours-closed]').checked
        : false;
    });
  }

  function formPayload() {
    return {
      name: fields.name.value,
      description: fields.description.value,
      contactEmail: fields.contactEmail.value,
      phone: fields.phone.value,
      addressLine: fields.addressLine.value,
      governorate: fields.governorate.value,
      wilayat: fields.wilayat.value,
      serviceAreas: fields.serviceAreas.value
        .split(',')
        .map((area) => area.trim())
        .filter(Boolean),
      isTemporarilyClosed: temporarilyClosed.checked,
      closureNote: fields.closureNote.value,
      hours: hoursRows.map((row) => ({
        dayOfWeek: Number(row.dataset.day),
        isClosed: row.querySelector('[data-hours-closed]').checked,
        opensAt: row.querySelector('[data-hours-open]').value,
        closesAt: row.querySelector('[data-hours-close]').value,
      })),
    };
  }

  async function saveBusiness() {
    clearMessage();
    clearErrors();
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    saveStatus.textContent = 'Saving your changes…';

    try {
      const data = await window.BaytnaApi.request('/api/v1/store/business', {
        method: 'PUT',
        headers: window.BaytnaApi.csrfHeaders(),
        body: formPayload(),
      });
      populateForm(data.business);
      saveStatus.textContent = 'All changes saved.';
      setMessage('Your business information was saved.', 'success');
      return data.business;
    } catch (error) {
      showErrors(error.details);
      saveStatus.textContent = 'Your changes could not be saved.';
      setMessage(error.message, 'error');
      throw error;
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save changes';
    }
  }

  async function loadBusiness() {
    form.setAttribute('aria-busy', 'true');
    Array.from(form.elements).forEach((element) => {
      element.disabled = true;
    });

    try {
      await window.BaytnaApi.getSession();
      const data = await window.BaytnaApi.request('/api/v1/store/business');
      populateForm(data.business);
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/pages/store/login.html');
        return;
      }
      setMessage(error.message, 'error');
    }
  }

  fields.description.addEventListener('input', updateDescriptionCount);
  temporarilyClosed.addEventListener('change', updateClosureField);
  hoursRows.forEach((row) => {
    row.querySelector('[data-hours-closed]').addEventListener('change', () => {
      updateHoursRow(row);
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveBusiness();
    } catch {
      // Errors are displayed next to the relevant fields.
    }
  });

  submitButton.addEventListener('click', async () => {
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';

    try {
      await saveBusiness();
      const data = await window.BaytnaApi.request('/api/v1/store/business/submit', {
        method: 'POST',
        headers: window.BaytnaApi.csrfHeaders(),
      });
      populateForm(data.business);
      setMessage('Your business was submitted for review.', 'success');
    } catch (error) {
      showErrors(error.details);
      setMessage(error.message, 'error');
    } finally {
      submitButton.textContent = 'Submit for review';
      if (currentBusiness) updateStatus(currentBusiness);
    }
  });

  loadBusiness();
})();
