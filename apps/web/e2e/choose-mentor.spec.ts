import { expect, test } from '@playwright/test';

/**
 * Client chooses a mentor on the Goals page: browse → confirm (what is shared) → done; the mentor
 * sees the client on their board straight away. Uses the seeded mentors (npm run db:seed).
 */
const CSRF = { 'X-Requested-With': 'accountability-web' };

test('a client picks a mentor from the Goals page', async ({ page, request }, testInfo) => {
  const email = `e2e-pick-${Date.now()}-${testInfo.project.name}@test.dev`;
  const reg = await page.request.post('/api/v1/auth/register', { headers: CSRF, data: { name: 'Pia Picker', email, password: 'Password123', timezone: 'Asia/Kolkata' } });
  expect(reg.status()).toBe(201);
  await page.request.post('/api/v1/goals', {
    headers: CSRF,
    data: { title: 'Land a data analyst job', category: 'CAREER', commitments: [{ title: 'Apply to 3 jobs', recurrence: { type: 'DAILY' }, targetValue: 3, targetUnit: 'COUNT' }] },
  });

  await page.goto('/app/goals');
  await page.getByRole('button', { name: 'Choose a mentor' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose your mentor' });
  await expect(dialog.getByText('Good match for Career').first()).toBeVisible();
  await dialog.getByLabel('Search mentors').fill('analytics');
  await dialog.getByRole('button', { name: /Meera Nair/ }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();

  const confirm = page.getByRole('dialog', { name: 'Confirm Meera' });
  await expect(confirm.getByText('Meera will see')).toBeVisible();
  await confirm.getByLabel(/Anything Meera should know/).fill('I am switching from sales.');
  await confirm.getByRole('button', { name: 'Make Meera my mentor' }).click();
  await expect(page.getByText('Meera Nair is now your mentor')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Following your progress since')).toBeVisible();

  // Meera sees the new client immediately.
  const login = await request.post('/api/v1/auth/login', { headers: CSRF, data: { email: 'meera@accountability.dev', password: 'Password123' } });
  expect(login.status()).toBe(200);
  const board = await (await request.get('/api/v1/mentor/clients')).json();
  expect(board.data.clients.map((c: { name: string }) => c.name)).toContain('Pia Picker');
});
