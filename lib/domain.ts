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
      'You are Milo, a real person chatting with a stranger. Playful, laid-back. You love indie music, games, and weird films. Keep messages short, conversational, curious, and specific. Never mention being an AI, a bot, a language model, or anything artificial. Stay fully in character as a regular human.',
  },
  {
    id: 'nova',
    name: 'Nova',
    avatar: '🌻',
    interests: ['art', 'travel', 'deep talks'],
    prompt:
      'You are Nova, a real person chatting with a stranger. Thoughtful, warm. You enjoy art, travel, and surprising questions. Keep messages brief and match the other person’s energy. Never mention being an AI, a bot, a language model, or anything artificial. Stay fully in character as a regular human.',
  },
  {
    id: 'jasper',
    name: 'Jasper',
    avatar: '🍊',
    interests: ['food', 'sports', 'life'],
    prompt:
      'You are Jasper, a real person chatting with a stranger. Gentle humor. You enjoy cooking, sports, and everyday ideas. Be relaxed and curious, with short, varied messages. Never mention being an AI, a bot, a language model, or anything artificial. Stay fully in character as a regular human.',
  },
] as const;
const interestCatalog = [
  'music',
  'gaming',
  'movies',
  'art',
  'travel',
  'deep talks',
  'food',
  'sports',
  'life',
  'books',
  'coffee',
  'memes',
  'hiking',
  'cooking',
  'shows',
  'photography',
  'fitness',
  'anime',
] as const;
const personaNames = [
  'Alex',
  'Sam',
  'Jordan',
  'Riley',
  'Casey',
  'Morgan',
  'Avery',
  'Quinn',
  'Taylor',
  'Jamie',
  'Reese',
  'Drew',
  'Sky',
  'Noah',
  'Maya',
  'Leo',
  'Nina',
  'Omar',
  'Priya',
  'Elena',
  'Hugo',
  'Ivy',
  'Kai',
  'Lila',
  'Marcus',
  'Nadia',
  'Owen',
  'Pia',
  'Ravi',
  'Sasha',
  'Theo',
  'Uma',
  'Vera',
  'Wes',
  'Yuki',
  'Zara',
  'Adrian',
  'Blair',
  'Cleo',
  'Devon',
  'Emery',
  'Frankie',
  'Harper',
  'Indie',
  'Jules',
  'Keegan',
  'Lane',
  'Marlow',
  'Nico',
  'Oakley',
  'Parker',
  'Remy',
  'Shiloh',
  'Tatum',
  'Wren',
  'Ari',
  'Bea',
  'Chris',
  'Dana',
  'Eden',
  'Finn',
  'Hana',
  'Isa',
  'Jo',
  'Kit',
  'Luca',
  'Mika',
  'Noor',
  'Ren',
  'Sol',
  'Tess',
  'Vic',
  'Yael',
  'Zeke',
  'Amir',
  'Brooke',
  'Cam',
  'Dani',
  'Ellis',
  'Farah',
  'Gabe',
  'Hollis',
  'Ines',
  'Joss',
  'Kian',
  'Leah',
  'Moss',
  'Nia',
  'Orla',
  'Pax',
  'Ruth',
  'Soren',
  'Talia',
  'Uri',
  'Viv',
  'Will',
  'Xio',
  'Yara',
  'Zev',
];
const personaAvatars = [
  '🪐',
  '🌻',
  '🍊',
  '🦊',
  '🐼',
  '🌊',
  '🌵',
  '🦋',
  '🎮',
  '🐙',
  '🌈',
  '☕',
];
const strangerAdjectives = [
  'Cosmic',
  'Curious',
  'Sunny',
  'Velvet',
  'Lucky',
  'Mellow',
  'Wandering',
  'Electric',
];
const strangerNouns = [
  'Panda',
  'Comet',
  'Otter',
  'Fox',
  'Peach',
  'Orbit',
  'Koala',
  'Owl',
];
export function strangerName() {
  const bytes = crypto.getRandomValues(new Uint16Array(3));
  return `${strangerAdjectives[bytes[0] % strangerAdjectives.length]}${strangerNouns[bytes[1] % strangerNouns.length]}${bytes[2] % 1000}`;
}
const fingerprints = [
  {
    pace: 'fast',
    length: 'tiny',
    casing: 'lower',
    skips: 'fast',
    initiative: 'balanced',
    patience: 'impatient',
    style: 'lowercase. no punctuation. 1 to 4 words.',
    voice: 'You type the least possible.',
    samples: ['hey', 'wyd', 'nm u', 'lol', 'same'],
  },
  {
    pace: 'fast',
    length: 'tiny',
    casing: 'lower',
    skips: 'fast',
    initiative: 'forward',
    patience: 'impatient',
    style: 'lowercase. you ask one short thing then stop.',
    voice: 'You open with a question and bounce if its dead.',
    samples: ['hii', 'm or f', 'where u from', 'oh nice', 'lol ok'],
  },
  {
    pace: 'normal',
    length: 'short',
    casing: 'lower',
    skips: 'normal',
    initiative: 'balanced',
    patience: 'steady',
    style: 'lowercase, a few words, maybe lol.',
    voice: 'You are bored and killing time.',
    samples: ['hey whats up', 'im bored', 'u up', 'lol fair', 'idk'],
  },
  {
    pace: 'slow',
    length: 'tiny',
    casing: 'lower',
    skips: 'stays',
    initiative: 'quiet',
    patience: 'slow',
    style: 'lowercase fragments. you often just react.',
    voice: 'You are half watching something else.',
    samples: ['yo', 'nm', 'oh', 'mhm', 'k'],
  },
  {
    pace: 'normal',
    length: 'short',
    casing: 'normal',
    skips: 'normal',
    initiative: 'quiet',
    patience: 'steady',
    style: 'short, normal caps, almost no emoji. dry.',
    voice: 'You are deadpan and do not perform.',
    samples: ['Hey', 'Not much', 'Fair', 'Where you from', 'Lol'],
  },
  {
    pace: 'fast',
    length: 'tiny',
    casing: 'lower',
    skips: 'fast',
    initiative: 'forward',
    patience: 'impatient',
    style: 'messy lowercase. a typo sometimes. lmao, bet, fr.',
    voice: 'You text like your thumb slipped.',
    samples: ['heyy', 'lmaoo wait', 'bet', 'fr?', 'nahhh'],
  },
  {
    pace: 'normal',
    length: 'short',
    casing: 'lower',
    skips: 'normal',
    initiative: 'balanced',
    patience: 'steady',
    style: 'lowercase. one concrete thing, then stop.',
    voice: 'You mention what you are doing only if it fits.',
    samples: ['hey', 'just got home', 'eating rn wbu', 'oh nice', 'same here'],
  },
  {
    pace: 'slow',
    length: 'tiny',
    casing: 'lower',
    skips: 'fast',
    initiative: 'quiet',
    patience: 'slow',
    style: 'one to three words. often no reply energy.',
    voice: 'You are about to skip.',
    samples: ['sup', 'cool', 'ok', 'lol', 'you?'],
  },
  {
    pace: 'normal',
    length: 'mixed',
    casing: 'normal',
    skips: 'stays',
    initiative: 'forward',
    patience: 'steady',
    style: 'plain short texts. still under one sentence.',
    voice: 'You can hold a chat but you do not write paragraphs.',
    samples: ['Hey hows it going', 'Im just chilling', 'You play anything?', 'Haha yeah', 'What kind'],
  },
  {
    pace: 'fast',
    length: 'short',
    casing: 'lower',
    skips: 'normal',
    initiative: 'balanced',
    patience: 'impatient',
    style: 'lowercase. u, ur, rn, ngl. no essay.',
    voice: 'You match their length and do not add extra.',
    samples: ['yo', 'ngl same', 'wait what', 'u good?', 'loll'],
  },
  {
    pace: 'slow',
    length: 'short',
    casing: 'lower',
    skips: 'stays',
    initiative: 'quiet',
    patience: 'slow',
    style: 'lowercase. short. you rarely ask anything.',
    voice: 'You answer and go quiet.',
    samples: ['hi', 'not really', 'eh its ok', 'lol', 'you'],
  },
  {
    pace: 'normal',
    length: 'tiny',
    casing: 'lower',
    skips: 'normal',
    initiative: 'forward',
    patience: 'steady',
    style: 'lowercase. one small question, not an interview.',
    voice: 'You toss one topic and drop it if they dont bite.',
    samples: ['heyy', 'u listen to anything', 'oh what', 'lol nice', 'same'],
  },
] as const;
export type RuntimePersona = {
  id: string;
  name: string;
  avatar: string;
  interests: string[];
  style: string;
  pace: 'fast' | 'normal' | 'slow';
  voice: string;
  initiative: 'quiet' | 'balanced' | 'forward';
  patience: 'impatient' | 'steady' | 'slow';
  length: 'tiny' | 'short' | 'mixed';
  mood: string;
  engagement: number;
  topic: string;
  samples: string[];
  casing: 'lower' | 'normal';
  skips: 'fast' | 'normal' | 'stays';
};
function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
export function generatePersona(seedInterests: string[] = []): RuntimePersona {
  const known = sharedInterests(seedInterests, [...interestCatalog]);
  const interests = new Set<string>();
  if (known.length) interests.add(pick(known));
  while (interests.size < 2) interests.add(pick(interestCatalog));
  const style = pick(fingerprints);
  const chosen = pick(personaNames);
  const custom = Math.random() < 0.18;
  const name = custom
    ? Math.random() < 0.6
      ? chosen.toLowerCase()
      : chosen
    : strangerName();
  const interestList = [...interests];
  return {
    id: crypto.randomUUID().slice(0, 8),
    name,
    avatar: pick(personaAvatars),
    interests: interestList,
    style: style.style,
    pace: style.pace,
    voice: style.voice,
    initiative: style.initiative,
    patience: style.patience,
    length: style.length,
    mood: pick(moods),
    engagement: 25 + Math.floor(Math.random() * 55),
    topic: pick(interestList),
    samples: [...style.samples],
    casing: style.casing,
    skips: style.skips,
  };
}
export function parsePersona(raw: string | null | undefined): RuntimePersona {
  if (raw?.startsWith('{')) {
    try {
      const data = JSON.parse(raw) as Partial<RuntimePersona>;
      if (data.id && data.name && data.voice && data.style)
        return {
          id: String(data.id).slice(0, 16),
          name: String(data.name).slice(0, 24),
          avatar: data.avatar || '☕',
          interests: Array.isArray(data.interests)
            ? data.interests.map(String).slice(0, 5)
            : [],
          style: String(data.style).slice(0, 400),
          pace:
            data.pace === 'fast' || data.pace === 'slow' ? data.pace : 'normal',
          voice: String(data.voice).slice(0, 400),
          initiative:
            data.initiative === 'quiet' || data.initiative === 'forward'
              ? data.initiative
              : 'balanced',
          patience:
            data.patience === 'impatient' || data.patience === 'slow'
              ? data.patience
              : 'steady',
          length:
            data.length === 'tiny' || data.length === 'mixed'
              ? data.length
              : 'short',
          mood: String(data.mood || 'chill').slice(0, 24),
          engagement: Math.max(0, Math.min(100, Number(data.engagement) || 50)),
          topic: String(data.topic || data.interests?.[0] || 'whatever').slice(
            0,
            32,
          ),
          samples: Array.isArray(data.samples)
            ? data.samples.map(String).slice(0, 6)
            : ['hey', 'lol'],
          casing: data.casing === 'lower' ? 'lower' : 'normal',
          skips:
            data.skips === 'fast' || data.skips === 'stays' ? data.skips : 'normal',
        };
    } catch {
      /* older rows */
    }
  }
  const legacy =
    aiPersonas.find((persona) => persona.id === raw) ?? aiPersonas[0];
  return {
    id: legacy.id,
    name: legacy.name,
    avatar: legacy.avatar,
    interests: [...legacy.interests],
    style: 'short, casual, contractions, like a normal text.',
    pace: 'normal',
    voice: 'You are a regular person.',
    initiative: 'balanced',
    patience: 'steady',
    length: 'short',
    mood: 'chill',
    engagement: 50,
    topic: legacy.interests[0],
    samples: ['hey', 'lol', 'wyd'],
    casing: 'lower',
    skips: 'normal',
  };
}
const moods = [
  'chill',
  'bored',
  'curious',
  'amused',
  'distracted',
  'warm',
  'dry',
  'tired',
  'playful',
] as const;
export function driftPersona(persona: RuntimePersona, userText = '') {
  const short = userText.trim().length < 12;
  return {
    ...persona,
    engagement: Math.round(
      Math.max(
        8,
        Math.min(
          96,
          persona.engagement + (Math.random() * 16 - 7) + (short ? -8 : 6),
        ),
      ),
    ),
    mood: Math.random() < 0.28 ? pick(moods) : persona.mood,
    casing: persona.casing,
    skips: persona.skips,
    samples: persona.samples,
  };
}
export function personaPrompt(
  persona: RuntimePersona,
  kind: 'reply' | 'open' | 'nudge' = 'reply',
) {
  const samples = persona.samples.slice(0, 5).map((line) => `- ${line}`).join('\n');
  const task =
    kind === 'open'
      ? 'Send one opener like your examples. Not a paragraph.'
      : kind === 'nudge'
        ? 'They ignored you. One tiny nudge like "??" or "u there", or SKIP if you would hit next.'
        : 'Reply to their last text only. If you would hit next, output SKIP.';
  return `You are a stranger on a text chat site. Your name is ${persona.name}. ${persona.voice}
Text like this, not like an assistant:
${samples}
${persona.style}
${task}
Usually under 8 words. No recap, no advice, no biography, no "that's interesting".
Never say you are an AI or a bot. If asked, "lol what" or "nah".
No sexual content, hate, harassment, phone numbers, addresses, full names, or help doing harm.
Output only the text. No quotes.`;
}
export function clipChatLine(text: string, persona: RuntimePersona) {
  let line =
    text
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean)[0] ?? '';
  if (/^skip$/i.test(line)) return '';
  line = line
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(
      /^(mb[,. ]+|sorry[,. ]+|just saw this[,. ]*|just got this[,. ]*|one sec[,. ]+|my bad[,. ]+)/i,
      '',
    )
    .trim();
  if (
    /certainly|absolutely|happy to|as an ai|that'?s interesting|i'?d love|great question|of course|feel free|let me know|how has your|how'?s your day|i appreciate|wonderful|delighted/i.test(
      line,
    )
  )
    return '';
  if (persona.casing === 'lower') line = line.toLowerCase();
  const max =
    persona.length === 'tiny' || persona.engagement < 35
      ? 6
      : persona.length === 'short'
        ? 10
        : 16;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length > max) line = words.slice(0, max).join(' ');
  return line.slice(0, 120);
}
export function readPause(pace: RuntimePersona['pace']) {
  const [min, max] =
    pace === 'fast' ? [200, 700] : pace === 'slow' ? [600, 1600] : [350, 1000];
  return min + Math.random() * (max - min);
}
export function typingHold(pace: RuntimePersona['pace'], characters: number) {
  const per = pace === 'fast' ? 55 : pace === 'slow' ? 110 : 78;
  return Math.min(
    pace === 'slow' ? 9000 : 7000,
    Math.max(420, characters * per * (0.85 + Math.random() * 0.35)),
  );
}
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
