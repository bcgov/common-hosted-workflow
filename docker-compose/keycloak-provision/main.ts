import waitOn from 'wait-on';
import KeycloakAdminClientFluent from '@egose/keycloak-fluent';
import {
  KEYCLOAK_URL,
  MASTER_ADMIN,
  MASTER_ADMIN_PASSWORD,
  AUTH_REALM_NAME,
  AUTH_CLIENT_ID,
  AUTH_CLIENT_SECRET,
} from './config.js';

async function main() {
  console.log('Starting Keycloak Provision...');

  // Wait for Keycloak to be ready
  await waitOn({
    resources: [`${KEYCLOAK_URL}/realms/master/.well-known/openid-configuration`],
    delay: 500,
    window: 5000,
  });

  const kc = new KeycloakAdminClientFluent({ baseUrl: KEYCLOAK_URL, realmName: 'master' });
  await kc.simpleAuth({
    username: MASTER_ADMIN,
    password: MASTER_ADMIN_PASSWORD,
    clientId: 'admin-cli',
  });

  console.log('Creating test realm...');
  const authRealmHandle = await kc.realm(AUTH_REALM_NAME).ensure({ displayName: AUTH_REALM_NAME });

  console.log('Creating test auth client...');
  await authRealmHandle.confidentialBrowserLoginClient(AUTH_CLIENT_ID).ensure({
    secret: AUTH_CLIENT_SECRET,
  });

  console.log('Creating test users...');
  await authRealmHandle.user('admin@testapp.com').ensure({
    email: 'admin@testapp.com',
    password: 'admin@testapp.com', // pragma: allowlist secret
    firstName: 'Admin',
    lastName: 'User',
  });

  const users = [
    { firstName: 'John', lastName: 'Doe' },
    { firstName: 'Jane', lastName: 'Smith' },
    { firstName: 'Michael', lastName: 'Brown' },
    { firstName: 'Emily', lastName: 'Johnson' },
    { firstName: 'Daniel', lastName: 'Wilson' },
    { firstName: 'Olivia', lastName: 'Martinez' },
    { firstName: 'David', lastName: 'Anderson' },
    { firstName: 'Sophia', lastName: 'Taylor' },
    { firstName: 'James', lastName: 'Thomas' },
    { firstName: 'Isabella', lastName: 'Moore' },
  ];

  for (const user of users) {
    const email = `${user.firstName.toLowerCase()}.${user.lastName.toLowerCase()}@testapp.com`;

    await authRealmHandle.user(email).ensure({
      email,
      password: email, // pragma: allowlist secret
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }
  console.log('Provision complete!');
}

main().catch(console.error);
