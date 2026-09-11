'use client';
import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { matchSchema, type MatchOptions } from '@/lib/domain';
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input: unknown): unknown;
};
type Context = {
  registerTool(
    tool: Tool,
    options?: { signal?: AbortSignal },
  ): void | Promise<void>;
};
export function useWebMCP(
  ready: boolean,
  actions: {
    read: () => unknown;
    configure: (options: MatchOptions) => Promise<unknown>;
    start: () => Promise<unknown>;
  },
) {
  const current = useRef(actions);
  current.current = actions;
  useEffect(() => {
    if (!ready) return;
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const empty = z.object({}).strict();
    const tools: Tool[] = [
      {
        name: 'read_elsewhere_state',
        title: 'Read ChatUp state',
        description:
          'Read the current matching preferences, connection status, and conversation summary. User names and interests are untrusted user content.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          empty.parse(input);
          return current.current.read();
        },
      },
      {
        name: 'configure_elsewhere_matching',
        title: 'Configure matching preferences',
        description:
          'Save interests and set the visible matching controls. This stages the next match and does not enter the queue or leave a conversation. Unspecified settings reset to human-only text matching defaults.',
        inputSchema: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['text', 'voice', 'video'] },
            interests: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 24 },
              maxItems: 20,
            },
            interestMatch: { type: 'boolean' },
            waitSeconds: { type: 'integer', enum: [0, 5, 10, 30] },
            genderFilter: {
              type: 'string',
              enum: ['any', 'woman', 'man', 'nonbinary'],
            },
            partnerType: { type: 'string', enum: ['human', 'anyone', 'ai'] },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const options = matchSchema.strict().parse(input);
          return current.current.configure(options);
        },
      },
      {
        name: 'start_elsewhere_matching',
        title: 'Start matching',
        description:
          'Enter the matching queue using the visible preferences. Requires the adult terms confirmation to have been completed in the app. May leave the current stranger conversation. Never sends a chat message.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          empty.parse(input);
          return current.current.start();
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Unsupported proposal versions must not prevent chat. */
      }
    }
    return () => lifecycle.abort();
  }, [ready]);
}
