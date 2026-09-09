import { describe, expect, it } from 'vitest';
import {
  annualPrice,
  autoEmoji,
  gameWinner,
  interestsRequired,
  matchSchema,
  normalizeInterests,
  plans,
  playMove,
  profileSchema,
  sharedInterests,
  type Game,
} from '../lib/domain';
import { detectMedia } from '../server/media';
import { validPushEndpoint } from '../server/push';

const game = (kind: Game['kind'] = 'tic-tac-toe'): Game => ({
  id: 'game',
  chatId: 'chat',
  kind,
  board: Array(kind === 'tic-tac-toe' ? 9 : 42).fill(null),
  players: ['a', 'b'],
  turn: 'a',
  winner: null,
  revision: 0,
});
describe('matching and membership boundaries', () => {
  it('normalizes duplicate and mixed-case interests', () =>
    expect(normalizeInterests(['Music', ' music ', '', 'Art'])).toEqual([
      'music',
      'art',
    ]));
  it('finds shared interests without case or whitespace mismatches', () =>
    expect(
      sharedInterests([' Art', 'ART', 'gaming'], ['art', 'music']),
    ).toEqual(['art']));
  it.each([5, 10, 30] as const)(
    'relaxes interest matching at exactly %i seconds',
    (seconds) => {
      const options = { interestMatch: true, waitSeconds: seconds };
      expect(interestsRequired(options, 1000, 1000 + seconds * 1000 - 1)).toBe(
        true,
      );
      expect(interestsRequired(options, 1000, 1000 + seconds * 1000)).toBe(
        false,
      );
    },
  );
  it('keeps forever matching strict', () =>
    expect(
      interestsRequired({ interestMatch: true, waitSeconds: 0 }, 0, 1e12),
    ).toBe(true));
  it('does not filter when interest matching is disabled', () =>
    expect(
      interestsRequired({ interestMatch: false, waitSeconds: 0 }, 0, 10),
    ).toBe(false));
  it('uses human-only text matching by default', () =>
    expect(matchSchema.parse({})).toMatchObject({
      mode: 'text',
      partnerType: 'human',
    }));
  it('rejects unsupported wait times and excess interests', () => {
    expect(matchSchema.safeParse({ waitSeconds: 7 }).success).toBe(false);
    expect(
      profileSchema.safeParse({ interests: Array(21).fill('a') }).success,
    ).toBe(false);
  });
  it('prices annual memberships at exactly 20 percent less', () => {
    expect(annualPrice('basic')).toBe(48);
    expect(annualPrice('plus')).toBe(96);
    expect(annualPrice('free')).toBe(0);
  });
  it('keeps the requested plan entitlements', () => {
    expect(plans.basic).toMatchObject({
      interests: 13,
      history: 15,
      images: true,
      videos: false,
    });
    expect(plans.plus).toMatchObject({
      interests: 20,
      history: 25,
      images: true,
      videos: true,
    });
  });
  it('converts standalone emoticons and preserves URLs and code-like text', () => {
    expect(autoEmoji('hey :) <3! :D')).toBe('hey 🙂 ❤️! 😄');
    expect(autoEmoji('https://a.example/:) my:)code')).toBe(
      'https://a.example/:) my:)code',
    );
  });
});
describe('authoritative games', () => {
  it.each([
    [0, 1, 2],
    [0, 3, 6],
    [0, 4, 8],
    [2, 4, 6],
  ])('detects tic-tac-toe line %j', (...cells) => {
    const g = game();
    for (const cell of cells) g.board[cell] = 'a';
    expect(gameWinner(g.board, g.kind)).toBe('a');
  });
  it('detects a draw', () =>
    expect(
      gameWinner(['a', 'b', 'a', 'a', 'b', 'b', 'b', 'a', 'a'], 'tic-tac-toe'),
    ).toBe('draw'));
  it('does not mutate an old board', () => {
    const old = game();
    const next = playMove(old, 'a', 0, 0);
    expect(old.board[0]).toBe(null);
    expect(next.board[0]).toBe('a');
    expect(next.turn).toBe('b');
    expect(next.revision).toBe(1);
  });
  it('rejects out-of-turn, replayed, invalid, and occupied moves', () => {
    expect(() => playMove(game(), 'b', 0, 0)).toThrow('turn');
    expect(() => playMove(game(), 'a', 0, 2)).toThrow('changed');
    expect(() => playMove(game(), 'a', 0.5, 0)).toThrow('valid');
    expect(() => playMove(game(), 'a', 9, 0)).toThrow('full');
    const next = playMove(game(), 'a', 0, 0);
    expect(() => playMove(next, 'b', 0, 1)).toThrow('full');
  });
  it.each([
    [35, 36, 37, 38],
    [0, 7, 14, 21],
    [0, 8, 16, 24],
    [6, 12, 18, 24],
  ])('detects connect-four line %j', (...cells) => {
    const g = game('connect-four');
    for (const cell of cells) g.board[cell] = 'a';
    expect(gameWinner(g.board, g.kind)).toBe('a');
  });
  it('does not wrap a connect-four line across edges', () => {
    const g = game('connect-four');
    [5, 6, 7, 8].forEach((i) => (g.board[i] = 'a'));
    expect(gameWinner(g.board, g.kind)).toBe(null);
  });
  it('applies gravity and rejects a full column', () => {
    let g = game('connect-four');
    for (let i = 0; i < 6; i++) g = playMove(g, g.turn, 0, g.revision);
    expect(g.board.filter(Boolean)).toHaveLength(6);
    expect(() => playMove(g, g.turn, 0, g.revision)).toThrow('full');
  });
  it('rejects moves after a game finishes', () =>
    expect(() => playMove({ ...game(), winner: 'a' }, 'a', 1, 0)).toThrow(
      'finished',
    ));
});
describe('untrusted uploads and push endpoints', () => {
  it('rejects SVG, HTML, and arbitrary bytes regardless of claimed MIME type', () => {
    const enc = new TextEncoder();
    for (const body of [
      '<svg onload="alert(1)"></svg>',
      '<html></html>',
      'hello',
    ])
      expect(detectMedia(enc.encode(body))).toBe(null);
  });
  it('recognizes supported magic bytes', () => {
    expect(detectMedia(Uint8Array.of(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(detectMedia(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(detectMedia(new TextEncoder().encode('RIFF0000WEBP'))).toBe(
      'image/webp',
    );
  });
  it.each([
    'http://fcm.googleapis.com/send',
    'https://127.0.0.1/',
    'https://fcm.googleapis.com.evil.test/',
    'https://evil.test/?host=fcm.googleapis.com',
    'https://name:pass@fcm.googleapis.com/',
    'https://fcm.googleapis.com:8443/',
  ])('rejects unsafe push endpoint %s', (value) =>
    expect(validPushEndpoint(value)).toBe(false),
  );
  it.each([
    'https://fcm.googleapis.com/fcm/send/token',
    'https://web.push.apple.com/token',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
  ])('accepts a supported browser push service %s', (value) =>
    expect(validPushEndpoint(value)).toBe(true),
  );
});
