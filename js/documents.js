(function initializeDocuments() {
  const form = document.getElementById('document-form');
  const typeInput = document.getElementById('document-type');
  const fileInput = document.getElementById('document-file');
  const uploadButton = document.getElementById('upload-document');
  const message = document.getElementById('documents-message');
  const loading = document.getElementById('documents-loading');
  const empty = document.getElementById('documents-empty');
  const list = document.getElementById('documents-list');
  const total = document.getElementById('documents-total');

  const typeLabels = {
    identity_document: 'Owner identity document',
    business_registration: 'Business registration',
    food_safety_certificate: 'Food safety certificate',
    other: 'Other supporting document',
  };

  function element(tag, className, text) {
    const created = document.createElement(tag);
    if (className) created.className = className;
    if (text !== undefined) created.textContent = text;
    return created;
  }

  function showMessage(text, kind) {
    message.textContent = text;
    message.className = `business-alert business-alert--${kind}`;
    message.hidden = false;
  }

  function clearErrors() {
    document.getElementById('document-type-error').textContent = '';
    document.getElementById('document-file-error').textContent = '';
    typeInput.removeAttribute('aria-invalid');
    fileInput.removeAttribute('aria-invalid');
  }

  function showErrors(details) {
    if (details.documentType) {
      typeInput.setAttribute('aria-invalid', 'true');
      document.getElementById('document-type-error').textContent = details.documentType;
    }
    if (details.file) {
      fileInput.setAttribute('aria-invalid', 'true');
      document.getElementById('document-file-error').textContent = details.file;
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Date unavailable'
      : new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(date);
  }

  function render(documents) {
    list.replaceChildren();
    total.textContent = `${documents.length} ${documents.length === 1 ? 'document' : 'documents'}`;
    empty.hidden = documents.length !== 0;
    list.hidden = documents.length === 0;

    for (const documentRecord of documents) {
      const item = element('li', 'document-item');
      const details = element('div', 'document-item__details');
      details.append(
        element(
          'strong',
          'document-item__type',
          typeLabels[documentRecord.documentType] || 'Supporting document',
        ),
        element('span', 'document-item__name', documentRecord.originalName),
        element(
          'small',
          'document-item__meta',
          `${formatBytes(documentRecord.sizeBytes)} · Uploaded ${formatDate(documentRecord.createdAt)}`,
        ),
      );

      const actions = element('div', 'document-item__actions');
      const status = element(
        'span',
        'document-status-badge',
        documentRecord.reviewStatus[0].toUpperCase() + documentRecord.reviewStatus.slice(1),
      );
      status.dataset.status = documentRecord.reviewStatus;

      const download = element('a', 'btn-secondary', 'Download');
      download.href = `/api/v1/store/documents/${documentRecord.id}/content`;
      download.setAttribute('download', '');

      actions.append(status, download);
      item.append(details, actions);
      list.append(item);
    }
  }

  async function loadDocuments() {
    loading.hidden = false;
    empty.hidden = true;
    list.hidden = true;

    try {
      const data = await window.BaytnaApi.request('/api/v1/store/documents');
      render(data.documents);
    } catch (error) {
      total.textContent = 'Unavailable';
      showMessage(error.message, 'error');
    } finally {
      loading.hidden = true;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    message.hidden = true;

    const file = fileInput.files[0];
    const errors = {};
    if (!typeInput.value) errors.documentType = 'Choose a document type.';
    if (!file) {
      errors.file = 'Choose a file to upload.';
    } else if (file.size > 5 * 1024 * 1024) {
      errors.file = 'The file must be 5 MB or smaller.';
    }

    if (Object.keys(errors).length > 0) {
      showErrors(errors);
      return;
    }

    uploadButton.disabled = true;
    uploadButton.textContent = 'Uploading…';

    try {
      await window.BaytnaApi.upload('/api/v1/store/documents', file, {
        ...window.BaytnaApi.csrfHeaders(),
        'X-Document-Type': typeInput.value,
        'X-File-Name': encodeURIComponent(file.name),
      });
      form.reset();
      showMessage('Document uploaded securely and sent for review.', 'success');
      await loadDocuments();
    } catch (error) {
      showErrors(error.details || {});
      showMessage(error.message, 'error');
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = 'Upload document';
    }
  });

  loadDocuments();
})();
