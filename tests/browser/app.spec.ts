import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('landing and app adapt across phones, tablets, and desktop, with working controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mkdir('test-results/ui', { recursive: true });
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ]) {
    await test.step(`Landing at ${width}×${height}`, async () => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await expect(
        page.getByRole('link', { name: 'Start chatting', exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `test-results/ui/landing-${width}.png`,
          fullPage: true,
        });
    });
  }
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('link', { name: 'Start chatting', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Start a conversation', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ]) {
    await test.step(`App at ${width}×${height}`, async () => {
      await page.setViewportSize({ width, height });
      await expect(
        page.getByRole('button', { name: 'Start a conversation', exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `test-results/ui/chat-dark-${width}.png`,
          fullPage: true,
        });
    });
  }
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page
    .getByRole('button', { name: 'Settings', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Make yourself at home.' }),
  ).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('OrbitTester');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByText('Your profile is saved.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Preferences', exact: true }).click();
  const emoji = page.getByRole('switch', { name: 'Auto emoticons to emoji' });
  await expect(emoji).toBeChecked();
  await emoji.click();
  await expect(emoji).not.toBeChecked();
  await page.reload();
  await page.getByRole('tab', { name: 'Preferences', exact: true }).click();
  await expect(emoji).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/ui/settings-phone.png',
    fullPage: true,
  });
  await page.goto('/chat?view=plans');
  await expect(
    page.getByText('More room for connection.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: /Yearly/ }).click();
  await expect(page.getByText(/48/).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/ui/plans-phone.png',
    fullPage: true,
  });
  await page.goto('/chat?view=rooms');
  await expect(
    page.getByRole('heading', { name: /room/i }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/ui/rooms-phone.png',
    fullPage: true,
  });
  await page.goto('/chat?auth=signin');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  for (const route of [
    '/privacy',
    '/terms',
    '/safety',
    '/support',
    '/reset-password',
  ]) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
