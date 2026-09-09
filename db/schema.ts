import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  isAnonymous: integer('isAnonymous', { mode: 'boolean' }).default(false),
});
export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('idx_session_user').on(t.userId)],
);
export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: integer('accessTokenExpiresAt', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('idx_account_user').on(t.userId),
    uniqueIndex('idx_account_provider').on(t.providerId, t.accountId),
  ],
);
export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }),
  },
  (t) => [index('idx_verification_identifier').on(t.identifier)],
);
export const rateLimit = sqliteTable('rateLimit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('lastRequest').notNull(),
});
export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    authId: text('authId')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    avatar: text('avatar').notNull().default('🪐'),
    banner: text('banner').notNull().default('violet'),
    gender: text('gender').notNull().default('undisclosed'),
    interests: text('interests').notNull().default('[]'),
    prefs: text('prefs').notNull().default('{}'),
    plan: text('plan').notNull().default('free'),
    standing: text('standing').notNull().default('good'),
    stripeCustomerId: text('stripeCustomerId'),
    acceptedAt: integer('acceptedAt'),
    policyVersion: text('policyVersion'),
    createdAt: integer('createdAt').notNull(),
    lastSeen: integer('lastSeen').notNull(),
  },
  (t) => [index('idx_profiles_seen').on(t.lastSeen)],
);
export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  mode: text('mode').notNull().default('text'),
  title: text('title').notNull(),
  slug: text('slug').unique(),
  aiPersona: text('aiPersona'),
  createdAt: integer('createdAt').notNull(),
  endedAt: integer('endedAt'),
  meetingId: text('meetingId'),
});
export const members = sqliteTable(
  'members',
  {
    chatId: text('chatId')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    profileId: text('profileId')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    joinedAt: integer('joinedAt').notNull(),
    leftAt: integer('leftAt'),
    lastRead: integer('lastRead').default(0),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.profileId] }),
    index('idx_members_profile').on(t.profileId, t.joinedAt),
  ],
);
export const messages = sqliteTable(
  'messages',
  {
    sequence: integer('sequence').primaryKey({ autoIncrement: true }),
    id: text('id').notNull().unique(),
    chatId: text('chatId')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    senderId: text('senderId').notNull(),
    text: text('text').notNull(),
    kind: text('kind').notNull().default('text'),
    mediaId: text('mediaId'),
    createdAt: integer('createdAt').notNull(),
  },
  (t) => [index('idx_messages_chat_sequence').on(t.chatId, t.sequence)],
);
export const friendships = sqliteTable(
  'friendships',
  {
    id: text('id').primaryKey(),
    requester: text('requester')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    recipient: text('recipient')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    pairKey: text('pairKey').notNull().unique(),
    status: text('status').notNull().default('pending'),
    createdAt: integer('createdAt').notNull(),
  },
  (t) => [
    index('idx_friends_recipient').on(t.recipient, t.status),
    index('idx_friends_requester').on(t.requester, t.status),
  ],
);
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    profileId: text('profileId')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    text: text('text').notNull(),
    targetId: text('targetId'),
    readAt: integer('readAt'),
    createdAt: integer('createdAt').notNull(),
  },
  (t) => [index('idx_notifications_profile').on(t.profileId, t.createdAt)],
);
export const blocks = sqliteTable(
  'blocks',
  {
    blocker: text('blocker')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    blocked: text('blocked')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: integer('createdAt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.blocker, t.blocked] }),
    index('idx_blocks_blocked').on(t.blocked),
  ],
);
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporter: text('reporter').notNull(),
    reported: text('reported').notNull(),
    chatId: text('chatId').notNull(),
    reason: text('reason').notNull(),
    details: text('details').notNull(),
    context: text('context').notNull().default('[]'),
    status: text('status').notNull().default('open'),
    createdAt: integer('createdAt').notNull(),
  },
  (t) => [index('idx_reports_status').on(t.status, t.createdAt)],
);
export const matchQueue = sqliteTable(
  'matchQueue',
  {
    profileId: text('profileId')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(),
    options: text('options').notNull(),
    joinedAt: integer('joinedAt').notNull(),
    heartbeatAt: integer('heartbeatAt').notNull(),
    chatId: text('chatId'),
  },
  (t) => [index('idx_queue_mode').on(t.mode, t.heartbeatAt)],
);
export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    ownerId: text('ownerId')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    chatId: text('chatId'),
    objectKey: text('objectKey').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    purpose: text('purpose').notNull(),
    createdAt: integer('createdAt').notNull(),
  },
  (t) => [index('idx_media_owner').on(t.ownerId)],
);
export const games = sqliteTable(
  'games',
  {
    id: text('id').primaryKey(),
    chatId: text('chatId')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    revision: integer('revision').notNull().default(0),
    createdAt: integer('createdAt').notNull(),
  },
  (t) => [index('idx_games_chat').on(t.chatId, t.createdAt)],
);
export const socketTickets = sqliteTable(
  'socketTickets',
  {
    hash: text('hash').primaryKey(),
    profileId: text('profileId').notNull(),
    chatId: text('chatId').notNull(),
    expiresAt: integer('expiresAt').notNull(),
    sessionId: text('sessionId').notNull().default(''),
  },
  (t) => [index('idx_tickets_expiry').on(t.expiresAt)],
);
export const apiLimits = sqliteTable('apiLimits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expiresAt').notNull(),
});
export const aiJobs = sqliteTable('aiJobs', {
  messageId: text('messageId').primaryKey(),
  chatId: text('chatId').notNull(),
  status: text('status').notNull(),
  createdAt: integer('createdAt').notNull(),
  error: text('error'),
});
export const billingEvents = sqliteTable('billingEvents', {
  id: text('id').primaryKey(),
  createdAt: integer('createdAt').notNull(),
});
export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    profileId: text('profileId').notNull(),
    plan: text('plan').notNull(),
    status: text('status').notNull(),
    periodEnd: integer('periodEnd'),
    updatedAt: integer('updatedAt').notNull(),
  },
  (t) => [index('idx_subscription_profile').on(t.profileId)],
);
export const pushSubscriptions = sqliteTable('pushSubscriptions', {
  id: text('id').primaryKey(),
  profileId: text('profileId')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: integer('createdAt').notNull(),
});
export const moderationAudit = sqliteTable('moderationAudit', {
  id: text('id').primaryKey(),
  adminId: text('adminId').notNull(),
  profileId: text('profileId').notNull(),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  createdAt: integer('createdAt').notNull(),
});
export const supportTickets = sqliteTable(
  'supportTickets',
  {
    id: text('id').primaryKey(),
    profileId: text('profileId').notNull(),
    category: text('category').notNull(),
    message: text('message').notNull(),
    status: text('status').notNull().default('open'),
    response: text('response'),
    createdAt: integer('createdAt').notNull(),
    resolvedAt: integer('resolvedAt'),
  },
  (t) => [
    index('idx_support_status').on(t.status, t.createdAt),
    index('idx_support_profile').on(t.profileId),
  ],
);
