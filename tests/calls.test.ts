import { expect, it } from 'vitest';
import { parseIceServers } from '../server/calls';

it('normalizes Cloudflare single-object ICE responses to the browser array format', () => {
  const server = {
    urls: ['turn:example.invalid:3478'],
    username: 'fixture',
    credential: 'not-a-real-secret',
  };
  expect(parseIceServers({ iceServers: server })).toEqual([server]);
  expect(parseIceServers({ iceServers: [server] })).toEqual([server]);
});
it('rejects an empty or malformed relay response', () => {
  expect(() => parseIceServers({ iceServers: [] })).toThrow();
  expect(() => parseIceServers({ iceServers: { token: 'invalid' } })).toThrow();
});
