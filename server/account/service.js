import argon2 from 'argon2';

import { notFound, validationError } from '../http/errors.js';

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function ownedAccount(database, session) {
  const account = await database.get(
    `SELECT users.id, users.email, users.full_name, users.password_hash
     FROM users
     JOIN businesses ON businesses.owner_user_id = users.id
     WHERE users.id = ? AND users.role = 'store_owner' AND businesses.id = ?`,
    session.user_id,
    session.business_id,
  );

  if (!account) throw notFound('The Store account was not found.');
  return account;
}

function accountResponse(account) {
  return {
    email: account.email,
    fullName: account.full_name,
    userId: account.id,
  };
}

export async function getOwnedAccount(database, session) {
  return accountResponse(await ownedAccount(database, session));
}

export async function updateOwnedAccount(database, session, input) {
  const account = await ownedAccount(database, session);
  const fullName = cleanText(input?.fullName);

  if (fullName.length < 2 || fullName.length > 100) {
    throw validationError({
      fullName: 'Full name must contain between 2 and 100 characters.',
    });
  }

  if (fullName === account.full_name) return accountResponse(account);

  await database.transaction(async (transaction) => {
    await transaction.run(
      `UPDATE users
       SET full_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND role = 'store_owner'`,
      fullName,
      account.id,
    );
    await transaction.run(
      `INSERT INTO audit_events
        (business_id, actor_user_id, action, resource_type, resource_id)
       VALUES (?, ?, 'account.profile_updated', 'user', ?)`,
      session.business_id,
      session.user_id,
      session.user_id,
    );
  });

  return getOwnedAccount(database, session);
}

export async function changeOwnedPassword(database, session, input) {
  const account = await ownedAccount(database, session);
  const currentPassword = typeof input?.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword = typeof input?.newPassword === 'string' ? input.newPassword : '';
  const errors = {};

  if (!currentPassword) errors.currentPassword = 'Enter your current password.';
  if (newPassword.length < 8 || newPassword.length > 128) {
    errors.newPassword = 'New password must contain between 8 and 128 characters.';
  }
  if (Object.keys(errors).length > 0) throw validationError(errors);

  if (!(await argon2.verify(account.password_hash, currentPassword))) {
    throw validationError({ currentPassword: 'Current password is incorrect.' });
  }
  if (await argon2.verify(account.password_hash, newPassword)) {
    throw validationError({ newPassword: 'Choose a different password.' });
  }

  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

  await database.transaction(async (transaction) => {
    await transaction.run(
      `UPDATE users
       SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND role = 'store_owner'`,
      passwordHash,
      account.id,
    );
    await transaction.run(
      'DELETE FROM sessions WHERE user_id = ? AND id <> ?',
      session.user_id,
      session.session_id,
    );
    await transaction.run(
      `INSERT INTO audit_events
        (business_id, actor_user_id, action, resource_type, resource_id)
       VALUES (?, ?, 'account.password_changed', 'user', ?)`,
      session.business_id,
      session.user_id,
      session.user_id,
    );
  });

  return { changed: true };
}
