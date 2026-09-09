import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('two guests exchange messages, retry safely, recover after reconnecting, and play together', async ({
  browser,
  baseURL,
}) => {
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL))
    throw new Error('This test only uses a local development server.');
  const contexts: BrowserContext[] = [];
  const headers = { Origin: baseURL };
  async function actor() {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
    });
    contexts.push(context);
    expect(
      (
        await context.request.post('/api/auth/sign-in/anonymous', {
          headers,
          data: {},
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await context.request.post('/api/consent', {
          headers,
          data: { adult: true, acceptTerms: true },
        })
      ).ok(),
    ).toBe(true);
    return context;
  }
  try {
    const a = await actor(),
      b = await actor();
    const interests = [randomUUID().slice(0, 20)];
    const options = {
      mode: 'text',
      interests,
      interestMatch: true,
      waitSeconds: 0,
      genderFilter: 'any',
      partnerType: 'human',
    };
    expect(
      (await a.request.post('/api/match', { headers, data: options })).ok(),
    ).toBe(true);
    const matched = await (
      await b.request.post('/api/match', { headers, data: options })
    ).json();
    expect(matched.chatId).toBeTruthy();
    for (const context of contexts)
      await context.addInitScript(
        (id) => sessionStorage.setItem('elsewhere-active-chat', id),
        matched.chatId,
      );
    const alice = await a.newPage(),
      bob = await b.newPage();
    await Promise.all([alice.goto('/chat'), bob.goto('/chat')]);
    await expect(alice.getByLabel('Message', { exact: true })).toBeVisible();
    await expect(bob.getByLabel('Message', { exact: true })).toBeVisible();
    await alice
      .getByLabel('Message', { exact: true })
      .fill('Hello from the browser test');
    await alice
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      bob.getByText('Hello from the browser test', { exact: true }),
    ).toBeVisible();
    await alice.route('**/api/chats/*/messages', (route) =>
      route.request().method() === 'POST'
        ? route.abort('failed')
        : route.continue(),
    );
    await alice
      .getByLabel('Message', { exact: true })
      .fill('One retry, one message');
    await alice
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      alice.getByRole('button', { name: 'Not sent · Retry' }),
    ).toBeVisible();
    await alice.unroute('**/api/chats/*/messages');
    await alice.reload();
    await expect(
      alice.getByRole('button', { name: 'Not sent · Retry' }),
    ).toBeVisible();
    await alice.getByRole('button', { name: 'Not sent · Retry' }).click();
    await expect(
      bob.getByText('One retry, one message', { exact: true }),
    ).toHaveCount(1);
    await a.setOffline(true);
    await bob
      .getByLabel('Message', { exact: true })
      .fill('Saved while you were away');
    await bob
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      bob.getByText('Saved while you were away', { exact: true }),
    ).toBeVisible();
    await a.setOffline(false);
    await expect(
      alice.getByText('Saved while you were away', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await alice
      .getByRole('button', { name: 'Play a game', exact: true })
      .click();
    await alice.getByRole('button', { name: /Tic-tac-toe/ }).click();
    await expect(bob.locator('.game-board')).toBeVisible();
    await alice
      .getByRole('button', { name: 'Row 1, column 1', exact: true })
      .click();
    await expect(bob.locator('.game-board button').first()).toHaveText('×');
    await bob
      .getByRole('button', { name: 'Row 1, column 2', exact: true })
      .click();
    await expect(alice.locator('.game-board button').nth(1)).toHaveText('○', {
      timeout: 10000,
    });
    await alice.screenshot({
      path: 'test-results/ui/conversation-phone.png',
      fullPage: true,
    });
    await alice.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(
      bob.getByText('Every goodbye makes room for a new hello.', {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    for (const context of contexts) await context.close();
  }
});
