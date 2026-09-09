import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

test('three browsers exchange real RealtimeKit media and clean up on leaving', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !existsSync('.wrangler/group-call-fixture.json'),
    'Requires temporary tokens from an isolated RealtimeKit meeting.',
  );
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL))
    throw new Error('Only run provider fixtures against a local app.');
  const fixture = JSON.parse(
    readFileSync('.wrangler/group-call-fixture.json', 'utf8'),
  ) as { tokens: string[] };
  const contexts: BrowserContext[] = [],
    pages: Page[] = [];
  const headers = { Origin: baseURL };
  try {
    for (const token of fixture.tokens) {
      const context = await browser.newContext({
        baseURL,
        permissions: ['camera', 'microphone'],
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
      const joined = await context.request.post('/api/rooms/join', {
        headers,
        data: { slug: 'around-the-world' },
      });
      expect(joined.ok()).toBe(true);
      const room = await joined.json();
      await context.route('**/api/config', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          json: { ...(await response.json()), groupCalls: true },
        });
      });
      await context.route('**/api/chats/*/call', (route) =>
        route.fulfill({ json: { authToken: token, mode: 'video' } }),
      );
      await context.addInitScript((id: string) => {
        sessionStorage.setItem('elsewhere-active-chat', id);
        const native = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        );
        const streams: MediaStream[] = [];
        (
          window as Window & { groupTestStreams?: MediaStream[] }
        ).groupTestStreams = streams;
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          const stream = await native(constraints);
          streams.push(stream);
          return stream;
        };
      }, room.id);
      const page = await context.newPage();
      pages.push(page);
      await page.goto('/chat');
      await page
        .getByRole('button', { name: 'Start a call', exact: true })
        .click();
    }
    await Promise.all(
      pages.map((page) =>
        page
          .getByRole('button', { name: 'Join video call', exact: true })
          .click(),
      ),
    );
    for (const page of pages) {
      await expect(page.getByText('3 in call', { exact: true })).toBeVisible({
        timeout: 45000,
      });
      await expect
        .poll(
          () =>
            page
              .locator('.room-participant video')
              .evaluateAll(
                (videos) =>
                  videos.filter(
                    (v) =>
                      (v as HTMLVideoElement).readyState >= 2 &&
                      (v as HTMLVideoElement).videoWidth > 0,
                  ).length,
              ),
          { timeout: 45000 },
        )
        .toBe(3);
      await expect
        .poll(
          () =>
            page
              .locator('.room-participant audio')
              .evaluateAll(
                (audio) =>
                  audio.filter(
                    (a) =>
                      (a as HTMLAudioElement).srcObject instanceof
                        MediaStream && (a as HTMLAudioElement).readyState >= 2,
                  ).length,
              ),
          { timeout: 45000 },
        )
        .toBe(2);
    }
    await pages[0]
      .getByRole('button', { name: 'Mute microphone', exact: true })
      .click();
    await expect(
      pages[0].getByRole('button', { name: 'Unmute microphone', exact: true }),
    ).toBeVisible();
    await pages[0]
      .getByRole('button', { name: 'Leave room call', exact: true })
      .click();
    await expect(
      pages[1].getByText('2 in call', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        pages[0].evaluate(() =>
          (
            window as Window & { groupTestStreams?: MediaStream[] }
          ).groupTestStreams?.every((s) =>
            s.getTracks().every((t) => t.readyState === 'ended'),
          ),
        ),
      )
      .toBe(true);
    await pages[0]
      .getByRole('button', { name: 'Start a call', exact: true })
      .click();
    await pages[0]
      .getByRole('button', { name: 'Join video call', exact: true })
      .click();
    await expect(pages[0].getByText('3 in call', { exact: true })).toBeVisible({
      timeout: 30000,
    });
  } finally {
    for (const context of contexts) {
      await context.request
        .delete('/api/account', { headers, data: { confirmation: 'DELETE' } })
        .catch(() => {});
      await context.close();
    }
  }
});
