import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Admin invites a mentor → mentor sets a password → admin assigns a client → client accepts →
 * mentor writes a note and sends a nudge → the client sees the nudge but never the note.
 * Needs the seeded admin (npm run db:seed) or E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@accountability.dev', password: process.env.E2E_ADMIN_PASSWORD ?? 'Password123' };
const CSRF = { 'X-Requested-With': 'accountability-web' };

/** A timezone where it is about midday now, so nudges never hit the client's quiet hours (22:00–07:00). */
function middayTimezone(now = new Date()) {
  let n = (now.getUTCHours() - 12 + 24) % 24;
  if (n > 12) n -= 24;
  return n === 0 ? 'Etc/GMT' : `Etc/GMT${n > 0 ? '+' : ''}${n}`;
}

async function apiClient(request: APIRequestContext, name: string) {
  const email = `e2e-client-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.dev`;
  const reg = await request.post('/api/v1/auth/register', { headers: CSRF, data: { name, email, password: 'Password123', timezone: middayTimezone() } });
  expect(reg.status()).toBe(201);
  const goal = await request.post('/api/v1/goals', {
    headers: CSRF,
    data: { title: 'Run a 10K', category: 'FITNESS', commitments: [{ title: 'Walk 6000 steps', recurrence: { type: 'DAILY' }, targetValue: 1, targetUnit: 'BOOLEAN' }] },
  });
  expect(goal.status()).toBe(201);
  return email;
}

test('mentor onboarding, assignment with consent, notes and nudges', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one full run is enough; layouts are covered by the screenshots');
  const stamp = Date.now();
  const mentorName = `Mia Mentor ${stamp}`;
  const clientName = `Cara Client ${stamp}`;

  // Admin invites a mentor.
  const adminCtx = await browser.newContext({ baseURL });
  const admin = await adminCtx.newPage();
  await admin.goto('/login');
  await admin.getByLabel('Email').fill(ADMIN.email);
  await admin.getByLabel('Password').fill(ADMIN.password);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.getByRole('link', { name: 'Mentors' }).first().click();
  await admin.getByRole('button', { name: 'Invite mentor' }).click();
  await admin.getByLabel('Name').fill(mentorName);
  await admin.getByLabel('Email').fill(`e2e-mentor-${stamp}@test.dev`);
  await admin.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = await admin.getByLabel('Invite link').inputValue();
  expect(inviteUrl).toContain('/invite?token=');

  // Mentor accepts the invite and sets a password.
  const mentorCtx = await browser.newContext({ baseURL });
  const mentor = await mentorCtx.newPage();
  await mentor.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).search);
  await mentor.getByLabel('Password').fill('Password123');
  await mentor.getByRole('button', { name: 'Create my mentor account' }).click();
  await expect(mentor).toHaveURL(/\/mentor$/);
  await expect(mentor.getByText('No clients yet')).toBeVisible();

  // A client signs up (through the API for speed).
  const clientCtx = await browser.newContext({ baseURL });
  await apiClient(clientCtx.request, clientName);

  // Admin assigns the client to the mentor.
  await admin.keyboard.press('Escape');
  await admin.goto('/admin/clients?filter=unassigned');
  await admin.getByLabel('Search clients').fill(clientName);
  const row = admin.locator('li', { hasText: clientName });
  await row.getByRole('button', { name: 'Assign' }).click();
  const option = await admin.locator('#as-mentor option', { hasText: mentorName }).getAttribute('value');
  await admin.getByLabel('Mentor', { exact: true }).selectOption(option!);
  await admin.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(admin.getByText(/has been asked to accept/)).toBeVisible();

  // Before consent the mentor sees only a name.
  await mentor.reload();
  await expect(mentor.getByText(`Waiting to accept: ${clientName}`)).toBeVisible();

  // Client accepts.
  const client = await clientCtx.newPage();
  await client.goto('/app/dashboard');
  await expect(client.getByText(`${mentorName} would like to be your mentor`)).toBeVisible();
  await client.getByRole('button', { name: 'Accept' }).click();
  await expect(client.getByText(`From your mentor · ${mentorName}`)).toBeVisible();

  // Mentor opens the client, writes a private note and sends a nudge.
  await mentor.reload();
  await mentor.getByRole('link', { name: clientName }).click();
  await mentor.getByRole('tab', { name: 'Notes' }).click();
  await mentor.getByLabel('Quick note').fill('Private: worried about their sleep');
  await mentor.getByRole('button', { name: 'Save note' }).click();
  await expect(mentor.getByText('Private: worried about their sleep')).toBeVisible();
  await mentor.getByRole('button', { name: 'Nudge' }).first().click();
  await mentor.getByLabel('Template').selectOption('CUSTOM');
  await mentor.getByLabel('Message').fill('You can do this — one walk today!');
  await mentor.getByRole('button', { name: 'Send nudge' }).click();
  await expect(mentor.getByText(/^Sent to /)).toBeVisible();

  // The client sees the nudge, never the note.
  await client.reload();
  await expect(client.getByText('You can do this — one walk today!')).toBeVisible();
  await expect(client.getByText('worried about their sleep')).toHaveCount(0);

  // Role areas are enforced in the UI too: the client is sent home from /mentor.
  await client.goto('/mentor');
  await expect(client).toHaveURL(/\/app\/dashboard/);
});
