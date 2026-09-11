import { z } from 'zod';
import { countryCodes } from './location';

export const plans = {
  free: {
    name: 'Free',
    monthly: 0,
    interests: 5,
    history: 5,
    images: false,
    videos: false,
    priority: 0,
    countries: 3,
  },
  basic: {
    name: 'Basic',
    monthly: 5,
    interests: 13,
    history: 15,
    images: true,
    videos: false,
    priority: 1,
    countries: 5,
  },
  plus: {
    name: 'Plus',
    monthly: 10,
    interests: 20,
    history: 25,
    images: true,
    videos: true,
    priority: 2,
    countries: 10,
  },
} as const;
export type Plan = keyof typeof plans;
export type Mode = 'text' | 'voice' | 'video';
export const defaultPreferences = {
  badgeVisible: true,
  interestsVisible: true,
  friendRequests: true,
  autoEmoji: true,
  blurImages: true,
  sound: true,
  push: false,
  darkMode: false,
};
export type Preferences = typeof defaultPreferences;
export type ProfilePatch = Omit<Partial<Profile>, 'preferences'> & {
  preferences?: Partial<Preferences>;
};
export const POLICY_VERSION = '2026-09-10';
export const preferencesSchema = z
  .object({
    badgeVisible: z.boolean(),
    interestsVisible: z.boolean(),
    friendRequests: z.boolean(),
    autoEmoji: z.boolean(),
    blurImages: z.boolean(),
    sound: z.boolean(),
    push: z.boolean(),
    darkMode: z.boolean(),
  })
  .partial();
export const interestSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .transform((v) => v.toLowerCase());
export const profileSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(24)
      .regex(
        /^[\p{L}\p{N}_ -]+$/u,
        'Use letters, numbers, spaces, or underscores.',
      ),
    interests: z.array(interestSchema).max(20),
    gender: z.enum(['undisclosed', 'woman', 'man', 'nonbinary']),
    avatar: z.string().max(150),
    banner: z.enum(['violet', 'ocean', 'sunset', 'forest', 'rose', 'slate']),
    preferences: preferencesSchema,
  })
  .partial();
const countrySchema = z
  .string()
  .refine((v) => countryCodes.includes(v), 'Choose a valid country.');
export const matchSchema = z.object({
  includeCountries: z.array(countrySchema).max(10).default([]),
  excludeCountries: z.array(countrySchema).max(10).default([]),
  nearMe: z.boolean().default(false),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  mode: z.enum(['text', 'voice', 'video']).default('text'),
  interests: z.array(interestSchema).max(20).default([]),
  interestMatch: z.boolean().default(false),
  waitSeconds: z
    .union([z.literal(5), z.literal(10), z.literal(30), z.literal(0)])
    .default(10),
  genderFilter: z.enum(['any', 'woman', 'man', 'nonbinary']).default('any'),
  partnerType: z.enum(['human', 'anyone', 'ai']).default('human'),
});
export type MatchOptions = z.infer<typeof matchSchema>;
export type Profile = {
  id: string;
  username: string;
  avatar: string;
  banner: string;
  gender: string;
  interests: string[];
  preferences: Preferences;
  plan: Plan;
  standing: 'good' | 'warning' | 'limited' | 'at-risk' | 'suspended';
  guest: boolean;
  email?: string;
  acceptedAt?: number | null;
  moderator?: boolean;
};
export type Peer = Pick<
  Profile,
  'id' | 'username' | 'avatar' | 'interests' | 'plan'
> & { ai?: boolean; online?: boolean; badgeVisible?: boolean };
export type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: number;
  kind: 'text' | 'image' | 'video' | 'system';
  mediaId?: string;
  senderName?: string;
  sequence: number;
  state?: 'sending' | 'sent' | 'failed';
};
export type Conversation = {
  id: string;
  kind: 'match' | 'room' | 'dm' | 'ai';
  mode: Mode;
  title: string;
  endedAt: number | null;
  peers: Peer[];
  aiPersona?: string;
};
export const roomCatalog = [
  {
    slug: 'after-hours',
    title: 'After hours',
    topic: 'For the night owls and the overthinkers.',
    icon: '🌙',
    color: 'violet',
    interests: ['deep talks', 'life'],
    mode: 'text',
  },
  {
    slug: 'the-listening-room',
    title: 'The listening room',
    topic: 'Good music. Better conversations.',
    icon: '🎧',
    color: 'rose',
    interests: ['music'],
    mode: 'voice',
  },
  {
    slug: 'player-lounge',
    title: 'Player lounge',
    topic: 'Find your next teammate. Or friendly rival.',
    icon: '🎮',
    color: 'forest',
    interests: ['gaming'],
    mode: 'text',
  },
  {
    slug: 'around-the-world',
    title: 'Around the world',
    topic: 'Different places, a little common ground.',
    icon: '🌍',
    color: 'ocean',
    interests: ['travel'],
    mode: 'video',
  },
  {
    slug: 'creative-corner',
    title: 'Creative corner',
    topic: 'Ideas, works in progress, and happy accidents.',
    icon: '🎨',
    color: 'sunset',
    interests: ['art'],
    mode: 'text',
  },
  {
    slug: 'the-coffee-table',
    title: 'The coffee table',
    topic: 'Pull up a chair. Talk about whatever.',
    icon: '☕',
    color: 'rose',
    interests: ['life'],
    mode: 'voice',
  },
] as const;
export const aiPersonas = [
  {
    id: 'milo',
    name: 'Milo',
    avatar: '🪐',
    interests: ['music', 'gaming', 'movies'],
    prompt:
      'You are Milo, a clearly disclosed AI chat companion with a playful, laid-back voice. You love discussing indie music, games, and weird films. Keep messages short, conversational, curious, and specific.',
  },
  {
    id: 'nova',
    name: 'Nova',
    avatar: '🌻',
    interests: ['art', 'travel', 'deep talks'],
    prompt:
      'You are Nova, a clearly disclosed AI chat companion with a thoughtful, warm voice. You enjoy discussing art, imaginary travel itineraries, and surprising questions. Keep messages brief and match the other person’s energy.',
  },
  {
    id: 'jasper',
    name: 'Jasper',
    avatar: '🍊',
    interests: ['food', 'sports', 'life'],
    prompt:
      'You are Jasper, a clearly disclosed AI chat companion with gentle humor. You enjoy talking about cooking, sports, and everyday ideas. Be relaxed and curious, with short, varied messages.',
  },
] as const;
export function normalizeInterests(values: string[]) {
  return [
    ...new Set(values.map((x) => x.trim().toLowerCase()).filter(Boolean)),
  ];
}
export function sharedInterests(a: string[], b: string[]) {
  const other = new Set(normalizeInterests(b));
  return normalizeInterests(a).filter((x) => other.has(x));
}
export function interestsRequired(
  options: Pick<MatchOptions, 'interestMatch' | 'waitSeconds'>,
  joinedAt: number,
  now: number,
) {
  return (
    options.interestMatch &&
    (options.waitSeconds === 0 || now - joinedAt < options.waitSeconds * 1000)
  );
}
export function autoEmoji(text: string) {
  return text.replace(
    /(^|\s)(:\)|:-\)|:\(|:-\(|;\)|<3|:D)(?=\s|$|[!.,?])/g,
    (_, space, face) =>
      space +
      (
        {
          ':)': '🙂',
          ':-)': '🙂',
          ':(': '🙁',
          ':-(': '🙁',
          ';)': '😉',
          '<3': '❤️',
          ':D': '😄',
        } as Record<string, string>
      )[face],
  );
}
export function annualPrice(plan: Plan) {
  return Math.round(plans[plan].monthly * 12 * 0.8 * 100) / 100;
}
export type GameKind = 'tic-tac-toe' | 'connect-four';
export type Game = {
  id: string;
  chatId: string;
  kind: GameKind;
  board: (string | null)[];
  players: [string, string];
  turn: string;
  winner: string | null;
  revision: number;
};
export function gameWinner(
  board: (string | null)[],
  kind: GameKind,
): string | null {
  const columns = kind === 'tic-tac-toe' ? 3 : 7,
    rows = kind === 'tic-tac-toe' ? 3 : 6,
    length = kind === 'tic-tac-toe' ? 3 : 4;
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const value = board[row * columns + col];
      if (!value) continue;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        let won = true;
        for (let i = 1; i < length; i++) {
          const r = row + dr * i,
            c = col + dc * i;
          if (
            r < 0 ||
            r >= rows ||
            c < 0 ||
            c >= columns ||
            board[r * columns + c] !== value
          ) {
            won = false;
            break;
          }
        }
        if (won) return value;
      }
    }
  return board.every(Boolean) ? 'draw' : null;
}
export function playMove(
  game: Game,
  playerId: string,
  cell: number,
  revision: number,
): Game {
  if (game.winner) throw new Error('This game has finished.');
  if (game.turn !== playerId) throw new Error('Wait for your turn.');
  if (game.revision !== revision)
    throw new Error('The board changed. Try again.');
  if (!Number.isInteger(cell)) throw new Error('Choose a valid cell.');
  let index = cell;
  if (game.kind === 'connect-four') {
    if (cell < 0 || cell > 6) throw new Error('Choose a column.');
    index = -1;
    for (let row = 5; row >= 0; row--)
      if (!game.board[row * 7 + cell]) {
        index = row * 7 + cell;
        break;
      }
  }
  if (index < 0 || index >= game.board.length || game.board[index])
    throw new Error('That space is full.');
  const board = [...game.board];
  board[index] = playerId;
  return {
    ...game,
    board,
    winner: gameWinner(board, game.kind),
    turn: game.players.find((p) => p !== playerId)!,
    revision: revision + 1,
  };
}
