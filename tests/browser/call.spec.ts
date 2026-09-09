import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

test('two browsers establish video through Cloudflare TURN and release their media on hangup', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !existsSync('.wrangler/relay-fixture.json'),
    'Requires freshly generated, short-lived relay credentials from the authorized live API check.',
  );
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL))
    throw new Error('Only run media fixtures against a local app.');
  const ice = JSON.parse(readFileSync('.wrangler/relay-fixture.json', 'utf8'));
  const contexts: BrowserContext[] = [];
  const headers = { Origin: baseURL };
  try {
    for (let i = 0; i < 2; i++) {
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
      await context.route('**/api/config', async (route) => {
        const r = await route.fetch();
        await route.fulfill({
          response: r,
          json: { ...(await r.json()), turn: true },
        });
      });
      await context.route('**/api/chats/*/ice', (route) =>
        route.fulfill({ json: ice }),
      );
      await context.addInitScript(() => {
        const NativePeer = RTCPeerConnection;
        (window as Window & { testPeers?: RTCPeerConnection[] }).testPeers = [];
        window.RTCPeerConnection = class extends NativePeer {
          constructor(config?: RTCConfiguration) {
            super(config);
            (
              window as unknown as Window & { testPeers: RTCPeerConnection[] }
            ).testPeers.push(this);
          }
        };
      });
    }
    const options = {
      mode: 'video',
      interests: ['video-' + randomUUID().slice(0, 12)],
      interestMatch: true,
      waitSeconds: 0,
      genderFilter: 'any',
      partnerType: 'human',
    };
    await contexts[0].request.post('/api/match', { headers, data: options });
    const match = await (
      await contexts[1].request.post('/api/match', { headers, data: options })
    ).json();
    expect(match.chatId).toBeTruthy();
    const pages: Page[] = [];
    for (const context of contexts) {
      await context.addInitScript(
        (id) => sessionStorage.setItem('elsewhere-active-chat', id),
        match.chatId,
      );
      const page = await context.newPage();
      pages.push(page);
      await page.goto('/chat');
      await page
        .getByRole('button', { name: 'Start a call', exact: true })
        .click();
    }
    await Promise.all(
      pages.map((p) =>
        p.getByRole('button', { name: 'Join video call', exact: true }).click(),
      ),
    );
    for (const page of pages) {
      await expect
        .poll(
          () =>
            page
              .locator('.remote-video video')
              .evaluate(
                (v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0,
              ),
          { timeout: 45000 },
        )
        .toBe(true);
      const relayed = await page.evaluate(async () => {
        const peer = (
          window as unknown as Window & { testPeers: RTCPeerConnection[] }
        ).testPeers[0];
        const stats = await peer.getStats();
        let relay = false;
        stats.forEach((s) => {
          if (
            s.type === 'candidate-pair' &&
            s.state === 'succeeded' &&
            s.nominated
          )
            relay ||= stats.get(s.localCandidateId)?.candidateType === 'relay';
        });
        return relay;
      });
      expect(relayed).toBe(true);
    }
    await pages[0]
      .getByRole('button', { name: 'Mute microphone', exact: true })
      .click();
    await expect(
      pages[0].getByRole('button', { name: 'Unmute microphone', exact: true }),
    ).toBeVisible();
    await pages[0]
      .getByRole('button', { name: 'Leave call', exact: true })
      .click();
    await expect
      .poll(() =>
        pages[0].evaluate(() =>
          (
            window as unknown as Window & { testPeers: RTCPeerConnection[] }
          ).testPeers.every((p) => p.connectionState === 'closed'),
        ),
      )
      .toBe(true);
    await expect(
      pages[1].getByText('The other person left the call.', { exact: true }),
    ).toBeVisible();
    await contexts[0].request.post(`/api/chats/${match.chatId}/leave`, {
      headers,
      data: {},
    });
  } finally {
    for (const context of contexts) await context.close();
  }
});
