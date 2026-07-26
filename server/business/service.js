import { conflict, notFound, validationError } from '../http/errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d][\d\s-]{4,23}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateBusinessInput(input) {
  const errors = {};
  const values = {
    name: text(input.name),
    description: text(input.description),
    contactEmail: text(input.contactEmail).toLowerCase(),
    phone: text(input.phone),
    addressLine: text(input.addressLine),
    wilayat: text(input.wilayat),
    governorate: text(input.governorate),
    isTemporarilyClosed: input.isTemporarilyClosed === true,
    closureNote: text(input.closureNote),
    serviceAreas: Array.isArray(input.serviceAreas)
      ? [...new Set(input.serviceAreas.map(text).filter(Boolean))]
      : [],
    hours: Array.isArray(input.hours) ? input.hours : [],
  };

  if (values.name.length < 2 || values.name.length > 120) {
    errors.name = 'Business name must contain between 2 and 120 characters.';
  }
  if (values.description.length > 1000) {
    errors.description = 'Description cannot exceed 1,000 characters.';
  }
  if (!EMAIL_PATTERN.test(values.contactEmail) || values.contactEmail.length > 254) {
    errors.contactEmail = 'Enter a valid contact email.';
  }
  if (values.phone && !PHONE_PATTERN.test(values.phone)) {
    errors.phone = 'Enter a valid phone number.';
  }
  if (values.addressLine.length > 250) {
    errors.addressLine = 'Address cannot exceed 250 characters.';
  }
  if (values.wilayat.length > 100) {
    errors.wilayat = 'Wilayat cannot exceed 100 characters.';
  }
  if (values.governorate.length > 100) {
    errors.governorate = 'Governorate cannot exceed 100 characters.';
  }
  if (values.closureNote.length > 250) {
    errors.closureNote = 'Closure note cannot exceed 250 characters.';
  }
  if (values.serviceAreas.length > 10) {
    errors.serviceAreas = 'Add no more than 10 service areas.';
  } else if (values.serviceAreas.some((area) => area.length < 2 || area.length > 100)) {
    errors.serviceAreas = 'Each service area must contain between 2 and 100 characters.';
  }

  const days = new Set();
  if (values.hours.length !== 7) {
    errors.hours = 'Provide operating hours for all seven days.';
  } else {
    for (const hours of values.hours) {
      const day = Number(hours.dayOfWeek);
      const isClosed = hours.isClosed === true;

      if (!Number.isInteger(day) || day < 0 || day > 6 || days.has(day)) {
        errors.hours = 'Operating-hour days must be unique and valid.';
        break;
      }
      days.add(day);

      if (
        !isClosed &&
        (!TIME_PATTERN.test(hours.opensAt) ||
          !TIME_PATTERN.test(hours.closesAt) ||
          hours.opensAt >= hours.closesAt)
      ) {
        errors.hours = `${DAY_NAMES[day]} closing time must be later than opening time.`;
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw validationError(errors);
  }

  values.hours = values.hours
    .map((hours) => ({
      dayOfWeek: Number(hours.dayOfWeek),
      isClosed: hours.isClosed === true,
      opensAt: hours.isClosed === true ? null : hours.opensAt,
      closesAt: hours.isClosed === true ? null : hours.closesAt,
    }))
    .sort((first, second) => first.dayOfWeek - second.dayOfWeek);

  return values;
}

function toBusinessResponse(business, serviceAreas, hours) {
  const missingFields = [];

  if (!business.description) missingFields.push('description');
  if (!business.phone) missingFields.push('phone');
  if (!business.address_line) missingFields.push('address');
  if (!business.wilayat) missingFields.push('wilayat');
  if (!business.governorate) missingFields.push('governorate');
  if (serviceAreas.length === 0) missingFields.push('service areas');
  if (hours.every((entry) => entry.is_closed === 1)) missingFields.push('operating hours');

  return {
    id: business.id,
    name: business.name,
    description: business.description,
    contactEmail: business.contact_email,
    phone: business.phone,
    addressLine: business.address_line,
    wilayat: business.wilayat,
    governorate: business.governorate,
    applicationStatus: business.application_status,
    statusReason: business.status_reason,
    isTemporarilyClosed: business.is_temporarily_closed === 1,
    closureNote: business.closure_note,
    serviceAreas: serviceAreas.map((area) => area.name),
    hours: hours.map((entry) => ({
      dayOfWeek: entry.day_of_week,
      isClosed: entry.is_closed === 1,
      opensAt: entry.opens_at,
      closesAt: entry.closes_at,
    })),
    completeness: {
      isComplete: missingFields.length === 0,
      missingFields,
    },
    updatedAt: business.updated_at,
  };
}

export function getOwnedBusiness(database, session) {
  const business = database.get(
    'SELECT * FROM businesses WHERE id = ? AND owner_user_id = ?',
    session.business_id,
    session.user_id,
  );

  if (!business) throw notFound('Your business was not found.');

  const serviceAreas = database.all(
    'SELECT name FROM service_areas WHERE business_id = ? ORDER BY name',
    business.id,
  );
  const hours = database.all(
    'SELECT * FROM business_hours WHERE business_id = ? ORDER BY day_of_week',
    business.id,
  );

  return toBusinessResponse(business, serviceAreas, hours);
}

export function updateOwnedBusiness(database, session, input) {
  const values = validateBusinessInput(input);

  database.transaction(() => {
    const updateResult = database.run(
      `UPDATE businesses
       SET name = ?, description = ?, contact_email = ?, phone = ?, address_line = ?,
         wilayat = ?, governorate = ?, is_temporarily_closed = ?, closure_note = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND owner_user_id = ?`,
      values.name,
      values.description,
      values.contactEmail,
      values.phone,
      values.addressLine,
      values.wilayat,
      values.governorate,
      values.isTemporarilyClosed ? 1 : 0,
      values.closureNote,
      session.business_id,
      session.user_id,
    );

    if (updateResult.changes !== 1) throw notFound('Your business was not found.');

    database.run('DELETE FROM service_areas WHERE business_id = ?', session.business_id);
    for (const area of values.serviceAreas) {
      database.run(
        'INSERT INTO service_areas (business_id, name) VALUES (?, ?)',
        session.business_id,
        area,
      );
    }

    for (const hours of values.hours) {
      database.run(
        `UPDATE business_hours
         SET is_closed = ?, opens_at = ?, closes_at = ?
         WHERE business_id = ? AND day_of_week = ?`,
        hours.isClosed ? 1 : 0,
        hours.opensAt,
        hours.closesAt,
        session.business_id,
        hours.dayOfWeek,
      );
    }

    database.run(
      `INSERT INTO audit_events
        (business_id, actor_user_id, action, resource_type, resource_id, metadata_json)
       VALUES (?, ?, 'business.updated', 'business', ?, ?)`,
      session.business_id,
      session.user_id,
      session.business_id,
      JSON.stringify({
        fields: [
          'name',
          'description',
          'contactEmail',
          'phone',
          'address',
          'serviceAreas',
          'hours',
          'temporaryClosure',
        ],
      }),
    );
  });

  return getOwnedBusiness(database, session);
}

export function submitOwnedBusiness(database, session) {
  const business = getOwnedBusiness(database, session);

  if (!business.completeness.isComplete) {
    throw validationError({
      business: `Complete these fields before submitting: ${business.completeness.missingFields.join(', ')}.`,
    });
  }

  if (!['draft', 'rejected'].includes(business.applicationStatus)) {
    throw conflict('Only draft or rejected applications can be submitted.');
  }

  database.transaction(() => {
    const result = database.run(
      `UPDATE businesses
       SET application_status = 'pending', status_reason = '', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND owner_user_id = ? AND application_status IN ('draft', 'rejected')`,
      session.business_id,
      session.user_id,
    );

    if (result.changes !== 1) throw conflict('The application status changed. Refresh and retry.');

    database.run(
      `INSERT INTO audit_events
        (business_id, actor_user_id, action, resource_type, resource_id)
       VALUES (?, ?, 'business.submitted', 'business', ?)`,
      session.business_id,
      session.user_id,
      session.business_id,
    );
  });

  return getOwnedBusiness(database, session);
}
