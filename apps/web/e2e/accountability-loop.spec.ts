import { expect, test } from '@playwright/test';

import { crc32, deflateSync } from 'node:zlib';

/** A real 64×64 gradient PNG built in-test, so there is no binary fixture to maintain. */
function makePng(w = 64, h = 64) {
  const rows = Array.from({ length: h }, (_, y) => Buffer.concat([Buffer.from([0]), ...Array.from({ length: w }, (_, x) => Buffer.from([(x * 4) % 256, (y * 4) % 256, 160]))]));
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = makePng();

/**
 * Register → onboarding (goal + commitments) → dashboard → complete a task → check-in → result.
 */
test('new user completes the daily accountability loop', async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.dev`;

  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Onboarding wizard
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Your goal').fill('Get a new software engineering job');
  await page.getByRole('button', { name: 'Career' }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByLabel('Your reason').fill('Grow my career');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByLabel('How will you measure success?').fill('Job offer received');
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.getByLabel('Action', { exact: true }).first().fill('Apply to 5 jobs');
  await page.getByLabel('Measured as').first().selectOption('COUNT');
  await page.getByLabel('Target', { exact: true }).first().fill('5');
  await page.getByRole('button', { name: /Add commitment/ }).click();
  await page.getByLabel('Action', { exact: true }).nth(1).fill('Read documentation');
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.getByLabel('Daily check-in time').fill('21:00');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click(); // notifications
  await expect(page.getByRole('heading', { name: 'Review your plan' })).toBeVisible();
  await page.getByRole('button', { name: /Activate goal/ }).click();

  // Dashboard shows today's generated commitments
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByText('Today’s accountability')).toBeVisible();
  await expect(page.getByText('0 / 2 commitments completed')).toBeVisible();

  // One-tap complete (server-confirmed)
  await page.getByRole('button', { name: 'Mark “Read documentation” as done' }).click();
  await expect(page.getByText('1 / 2 commitments completed')).toBeVisible();

  // Partial via the task sheet
  await page.getByRole('button', { name: 'Open Apply to 5 jobs' }).click();
  await page.getByLabel('Amount done').fill('3');
  await page.getByRole('button', { name: 'Save progress' }).click();
  await expect(page.getByRole('dialog').getByText('3 / 5')).toBeVisible();

  // Photo evidence: compressed in the browser, uploaded straight to storage with a signed URL, then confirmed.
  await page.getByRole('button', { name: 'Add evidence (optional)' }).click();
  await page.getByLabel(/Evidence file/).setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Evidence photo' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // Guided check-in
  await page.getByRole('link', { name: 'Complete today’s check-in' }).click();
  await expect(page.getByRole('heading', { name: 'How did you do today?' })).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click(); // statuses prefilled from progress
  await expect(page.getByRole('heading', { name: 'What got in the way?' })).toBeVisible();
  await page.getByRole('button', { name: 'Unexpected work' }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('radio', { name: '4' }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('textbox').fill('Finished the reading early.');
  await page.getByRole('button', { name: /Submit check-in/ }).click();

  await expect(page.getByText('Completion', { exact: true })).toBeVisible();
  await expect(page.getByText('80%', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to today' }).click();
  await expect(page.getByText('Today’s check-in is complete')).toBeVisible();
  await expect(page.getByText('1 day streak')).toBeVisible();
});

test('protected pages redirect to sign-in', async ({ page }) => {
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fdashboard/);
});

test('every route is served as pre-rendered HTML', async ({ request }) => {
  for (const path of ['/', '/login', '/register', '/invite', '/onboarding', '/app/dashboard', '/app/goals/detail', '/mentor', '/mentor/clients/detail', '/mentor/prep', '/mentor/notes/edit', '/admin', '/admin/clients', '/admin/mentors/detail']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(await res.text(), path).toContain('<html');
  }
});
