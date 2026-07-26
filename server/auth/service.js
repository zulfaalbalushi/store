import argon2 from 'argon2';

import { conflict, unauthorized, validationError } from '../http/errors.js';
import { createDefaultCategories } from '../menu/defaults.js';
import { createSession } from './session.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateCredentials(input, requireRegistrationFields) {
  const errors = {};
  const email = normalizedEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  const businessName = typeof input.businessName === 'string' ? input.businessName.trim() : '';

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }

  if (password.length < 8 || password.length > 128) {
    errors.password = 'Password must contain between 8 and 128 characters.';
  }

  if (requireRegistrationFields && (fullName.length < 2 || fullName.length > 100)) {
    errors.fullName = 'Full name must contain between 2 and 100 characters.';
  }

  if (requireRegistrationFields && (businessName.length < 2 || businessName.length > 120)) {
    errors.businessName = 'Business name must contain between 2 and 120 characters.';
  }

  if (Object.keys(errors).length > 0) {
    throw validationError(errors);
  }

  return { businessName, email, fullName, password };
}

export async function registerStoreOwner(database, input, sessionSecret) {
  const values = validateCredentials(input, true);

  if (database.get('SELECT id FROM users WHERE email = ?', values.email)) {
    throw conflict('An account with this email already exists.');
  }

  const passwordHash = await argon2.hash(values.password, {
    type: argon2.argon2id,
  });

  const account = database.transaction(() => {
    const userResult = database.run(
      `INSERT INTO users (role, email, password_hash, full_name)
       VALUES ('store_owner', ?, ?, ?)`,
      values.email,
      passwordHash,
      values.fullName,
    );
    const userId = Number(userResult.lastInsertRowid);
    const businessResult = database.run(
      `INSERT INTO businesses (owner_user_id, name, contact_email)
       VALUES (?, ?, ?)`,
      userId,
      values.businessName,
      values.email,
    );
    const businessId = Number(businessResult.lastInsertRowid);

    for (let day = 0; day < 7; day += 1) {
      database.run(
        'INSERT INTO business_hours (business_id, day_of_week) VALUES (?, ?)',
        businessId,
        day,
      );
    }
    createDefaultCategories(database, businessId);

    return { businessId, businessName: values.businessName, email: values.email, userId };
  });

  return {
    account,
    session: createSession(database, account.userId, sessionSecret),
  };
}

export async function signInStoreOwner(database, input, sessionSecret) {
  const values = validateCredentials(input, false);
  const user = database.get(
    `SELECT users.id, users.email, users.password_hash, users.full_name,
      businesses.id AS business_id, businesses.name AS business_name
     FROM users
     JOIN businesses ON businesses.owner_user_id = users.id
     WHERE users.email = ? AND users.role = 'store_owner'`,
    values.email,
  );

  if (!user || !(await argon2.verify(user.password_hash, values.password))) {
    throw unauthorized('Email or password is incorrect.');
  }

  return {
    account: {
      businessId: user.business_id,
      businessName: user.business_name,
      email: user.email,
      fullName: user.full_name,
      userId: user.id,
    },
    session: createSession(database, user.id, sessionSecret),
  };
}
