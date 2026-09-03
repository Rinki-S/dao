import baseConfig from './vite.config.js';

const workspace = {
  id: '01QA0000000000000000000001',
  name: 'Personal',
  description: 'A quiet place for long-term work.',
  rootPath: '/private/tmp/dao-ui-qa-workspace/personal',
  createdAt: '2026-08-18T08:00:00Z',
  updatedAt: '2026-08-21T08:00:00Z',
  deletedAt: null,
  version: 1,
  syncStatus: 'local',
};

const project = {
  id: '01QA0000000000000000000002',
  workspaceId: workspace.id,
  // Projects gained a parent after this fixture was written, and the schema
  // requires the field even when it is null — without it the QA server has
  // been failing at boot rather than rendering anything.
  parentId: null,
  name: 'Compiler Lab',
  description: 'Parser and runtime experiments',
  folderPath: `${workspace.rootPath}/compiler-lab`,
  status: 'active',
  startedAt: '2026-08-19T08:00:00Z',
  endedAt: null,
  createdAt: '2026-08-19T08:00:00Z',
  updatedAt: '2026-08-21T08:00:00Z',
  deletedAt: null,
  version: 1,
  syncStatus: 'local',
};

const notes = [
  {
    id: '01QA0000000000000000000003',
    workspaceId: workspace.id,
    projectId: null,
    title: 'Welcome Note',
    content:
      '# Welcome to Dao\n\nYour local workspace is ready.\n\n## Start here\n\nDao helps you stay focused by keeping everything local and organized.\n\n- Projects are just folders on your computer.\n- Notes are saved as Markdown files and always remain local.\n- Tasks help you plan and track work.\n- Use Search to open anything instantly.\n\n## How Dao stores your work\n\nYour workspace is a folder on your computer.  \nAll notes are plain Markdown files in that folder and its subfolders.  \nNothing leaves this device by default.\n\nYou are always in control—open your folder in Finder at any time to see your files.\n\nHappy writing!\n',
    filePath: `${workspace.rootPath}/welcome-note.md`,
    contentType: 'markdown',
    noteType: 'general',
    createdAt: '2026-08-21T07:20:00Z',
    updatedAt: '2026-08-21T07:20:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'local',
  },
  {
    id: '01QA0000000000000000000004',
    workspaceId: workspace.id,
    projectId: project.id,
    title: 'Parser recovery strategy',
    content: '# Parser recovery strategy\n\nKeep parsing after recoverable syntax errors.',
    filePath: `${project.folderPath}/parser-recovery-strategy.md`,
    contentType: 'markdown',
    noteType: 'project',
    createdAt: '2026-08-19T09:00:00Z',
    updatedAt: '2026-08-20T10:00:00Z',
    deletedAt: null,
    version: 2,
    syncStatus: 'local',
  },
  {
    id: '01QA0000000000000000000005',
    workspaceId: workspace.id,
    projectId: project.id,
    title: 'Error handling',
    content: '# Error handling\n\nDocument recovery fixtures and edge cases.',
    filePath: `${project.folderPath}/error-handling.md`,
    contentType: 'markdown',
    noteType: 'project',
    createdAt: '2026-08-18T09:00:00Z',
    updatedAt: '2026-08-19T10:00:00Z',
    deletedAt: null,
    version: 2,
    syncStatus: 'local',
  },
];

/* A workspace's whole task list is one Markdown document, not a row per task.
 * The fixture was a row per task, from before that changed, and every load of
 * this surface failed the schema with "expected object, received array".
 *
 * Unfinished first, then finished: that order is what the editor draws its
 * "done" divider at, so a fixture that put them the other way round would hide
 * the thing worth looking at. `@due(...)` and `!high` are the annotations it
 * renders as chips.
 */
const taskDocument = {
  workspaceId: workspace.id,
  filePath: `${workspace.rootPath}/tasks.md`,
  updatedAt: '2026-08-21T08:00:00Z',
  content: [
    '- [ ] Implement parser recovery @due(2026-08-21) !high',
    '  - [ ] Decide what a recoverable error is',
    '  - [x] Add error fixtures !medium',
    '- [ ] Write the release notes @due(2026-08-28) !low',
    '- [x] Rewrite the lexer flush path',
    '',
  ].join('\n'),
};

const activities = [
  {
    id: '01QA0000000000000000000008',
    workspaceId: workspace.id,
    projectId: null,
    entityType: 'note',
    entityId: notes[0].id,
    action: 'created',
    metadataJson: '{}',
    createdAt: '2026-08-21T07:20:00Z',
  },
];

const conversations = [
  {
    id: '01QA0000000000000000000009',
    workspaceId: workspace.id,
    title: 'Why the parser drops the last token',
    createdAt: '2026-08-27T09:00:00Z',
    updatedAt: '2026-08-27T09:04:00Z',
  },
  {
    id: '01QA0000000000000000000010',
    workspaceId: workspace.id,
    title: 'A reply that did not finish',
    createdAt: '2026-08-26T15:00:00Z',
    updatedAt: '2026-08-26T15:01:00Z',
  },
  {
    id: '01QA0000000000000000000015',
    workspaceId: workspace.id,
    title: 'A change waiting on you',
    createdAt: '2026-09-02T11:00:00Z',
    updatedAt: '2026-09-02T11:02:00Z',
  },
];

// The second conversation ends on a failed turn on purpose: a reply that stops
// mid-thought is a state this surface has to render well, and it is not one a
// working provider will produce on demand.
const chatMessages = {
  [conversations[0].id]: [
    {
      id: '01QA0000000000000000000011',
      conversationId: conversations[0].id,
      role: 'user',
      content: 'Why does the parser drop the last token when the file has no trailing newline?',
      position: 0,
      status: 'ok',
      createdAt: '2026-08-27T09:00:00Z',
    },
    {
      id: '01QA0000000000000000000012',
      conversationId: conversations[0].id,
      role: 'assistant',
      content:
        'The lexer emits a token only when it sees the character after it, so the final token is never flushed at end of input.\n\nTwo ways out:\n\n- flush whatever is buffered when the reader returns EOF\n- append a synthetic newline before lexing\n\nThe first is the honest fix; the second hides the bug in every file that already ends correctly.',
      position: 1,
      model: 'claude-sonnet-4-5',
      wire: 'anthropic',
      inputTokens: 812,
      outputTokens: 96,
      status: 'ok',
      createdAt: '2026-08-27T09:04:00Z',
    },
  ],
  [conversations[1].id]: [
    {
      id: '01QA0000000000000000000013',
      conversationId: conversations[1].id,
      role: 'user',
      content: 'Summarise the retry policy.',
      position: 0,
      status: 'ok',
      createdAt: '2026-08-26T15:00:00Z',
    },
    {
      id: '01QA0000000000000000000014',
      conversationId: conversations[1].id,
      role: 'assistant',
      content: 'One retry, not a loop. A model that answers with something unusable twice in a',
      position: 1,
      model: 'claude-sonnet-4-5',
      wire: 'anthropic',
      status: 'failed',
      errorMessage: 'read stream: unexpected EOF',
      createdAt: '2026-08-26T15:01:00Z',
    },
  ],
  '01QA0000000000000000000015': [
    {
      id: '01QA0000000000000000000016',
      conversationId: '01QA0000000000000000000015',
      role: 'user',
      content: 'Add the EOF flush to the parser recovery note.',
      position: 0,
      status: 'ok',
      createdAt: '2026-09-02T11:00:00Z',
    },
    {
      id: '01QA0000000000000000000017',
      conversationId: '01QA0000000000000000000015',
      role: 'assistant',
      content: 'Here is what I would add. Nothing is written until you say so.',
      position: 1,
      model: 'qa-model',
      wire: 'anthropic',
      status: 'ok',
      createdAt: '2026-09-02T11:02:00Z',
      // Pending, which is what says this turn is stopped on a person rather
      // than still running.
      toolCalls: [
        {
          id: 'qa-call-1',
          name: 'edit_note',
          input: JSON.stringify({ id: notes[1].id }),
          status: 'pending',
        },
      ],
    },
  ],
};

// A conversation stopped on a change nobody has answered, and one that has been
// answered, so both states of the card can be looked at without having to get a
// model to propose something on demand.
//
// The note here is the QA fixture's own parser note, and the change is a real
// one against its text: what is drawn has to be a comparison of two things that
// could actually be written, not a shape that only looks like one.
const proposedBefore = notes[1].content;
const proposedAfter = notes[1].content.replace(
  'Keep parsing after recoverable syntax errors.',
  'Keep parsing after recoverable syntax errors.\n\nFlush the buffered token when the reader returns EOF.',
);

const chatProposals = {
  '01QA0000000000000000000015': [
    {
      id: 'qa-proposal-1',
      conversationId: '01QA0000000000000000000015',
      toolCallId: 'qa-call-1',
      kind: 'edit_note',
      targetId: notes[1].id,
      title: notes[1].title,
      before: proposedBefore,
      after: proposedAfter,
      // The service computes this from the two texts above. Written out here
      // because the QA server stands in for the service, not for the diff.
      diff: [
        { op: 'keep', text: '# Parser recovery strategy' },
        { op: 'keep', text: '' },
        { op: 'keep', text: 'Keep parsing after recoverable syntax errors.' },
        { op: 'add', text: '' },
        { op: 'add', text: 'Flush the buffered token when the reader returns EOF.' },
      ],
      status: 'pending',
      createdAt: '2026-09-02T11:02:00Z',
    },
  ],
};

// What the model says after each kind of change was written.
const APPLIED_REPLY = {
  edit_note: 'Done — the note now says to flush the buffered token at EOF.',
  create_note: 'Written. The note is in your workspace now.',
  edit_tasks: 'Done — that one is ticked off.',
  rename_note: 'Renamed.',
  delete_note: 'Deleted. It is gone from the workspace.',
};

// Changes this server will refuse to apply, by id.
//
// Kept beside the fixtures rather than on them: the real service decides this
// when it tries to write, so a flag travelling in the payload would be a field
// the interface could come to read. Applying qa-proposal-1 fails, which is how
// the third state — somebody said yes and the note had moved on — can be looked
// at at all. Discarding it still works.
const refusesToApply = new Set(['qa-proposal-1']);

// Written to exercise what a reply is actually made of — prose, a list, a
// fenced block, a table, a link — so the rendered shapes can be looked at
// rather than assumed. It streams in pieces, so the pane can be watched filling
// in rather than only inspected once it has finished.
const QA_REPLY = [
  '## Why the last token is dropped',
  '',
  'The lexer flushes a token only when it sees the character after it, so the last one never lands.',
  '',
  '> The end of input is not a character, and `readRune` never reports one.',
  '',
  'Two ways out:',
  '',
  '- flush whatever is buffered when the reader returns EOF',
  '- append a synthetic newline before lexing',
  '',
  '```go',
  'if err == io.EOF {',
  '    return lexer.flush()',
  '}',
  '```',
  '',
  '| approach | honest |',
  '| --- | --- |',
  '| flush at EOF | yes |',
  '| synthetic newline | no |',
  '',
  '---',
  '',
  'The first is the fix. See [the SQLite docs](https://sqlite.org/foreignkeys.html) for the other thing you asked about.',
].join('\n');

/**
 * Answer a turn the way the service does — start, deltas, done — so the surface
 * can be looked at mid-answer, which is the state screenshots of a finished
 * reply never show.
 */
function streamChatReply(request, response, conversationId) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');

  const now = new Date().toISOString();
  const stored = chatMessages[conversationId] ?? (chatMessages[conversationId] = []);

  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });

  request.on('end', () => {
    const { content } = JSON.parse(body || '{}');
    const userMessage = {
      id: `qa-user-${stored.length}`,
      conversationId,
      role: 'user',
      content,
      position: stored.length,
      status: 'ok',
      createdAt: now,
    };
    stored.push(userMessage);

    // The service names a conversation after the message that started it, and
    // the QA server has to do the same or this surface is inspected in a state
    // production never reaches.
    const conversation = conversations.find((item) => item.id === conversationId);
    if (conversation && !conversation.title) {
      conversation.title = content.split('\n')[0].slice(0, 60);
    }

    const assistantId = `qa-assistant-${stored.length}`;
    response.write(
      `event: start\ndata: ${JSON.stringify({ userMessage, assistantMessageId: assistantId })}\n\n`,
    );

    // Talking past a change answers it: no. The service sets it aside before it
    // stores this turn and sends the row it set aside, which is the only thing
    // that will reach a pane already showing the card with its buttons live.
    const abandoned = (chatProposals[conversationId] ?? []).find(
      (item) => item.status === 'pending',
    );
    if (abandoned) {
      abandoned.status = 'discarded';
      response.write(`event: proposal\ndata: ${JSON.stringify(abandoned)}\n\n`);
    }

    // Asking for a change gets one prepared rather than made, which is the
    // whole shape of the thing: a short reply, then the card, then a turn that
    // is finished but stopped. Keyed off the word so this state can be reached
    // on demand — a model that proposes only when it feels like it is not
    // something a surface can be inspected against.
    const asked = PROPOSABLE.find((kind) => kind.match.test(content));
    if (asked) {
      return streamProposedChange(response, conversationId, assistantId, stored, asked);
    }

    // A tool runs before the reply starts, the way one does when the model
    // looks something up first.
    const toolCalls = [
      { name: 'search_notes', input: JSON.stringify({ query: 'lexer' }) },
      { name: 'read_tasks', input: '{}' },
    ];
    for (const call of toolCalls) {
      response.write(`event: tool\ndata: ${JSON.stringify(call)}\n\n`);
    }

    const words = QA_REPLY.split(' ');
    let index = 0;

    // A reader who presses stop closes the connection, and the service's answer
    // to that is to stop generating. Here it is also the difference between
    // ending the interval and writing to a destroyed socket until Node throws
    // and takes the dev server with it.
    let timer;
    response.on('close', () => clearInterval(timer));

    timer = setInterval(() => {
      if (response.writableEnded || response.destroyed) {
        clearInterval(timer);
        return;
      }

      if (index < words.length) {
        const text = index === 0 ? words[index] : ` ${words[index]}`;
        response.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
        index += 1;
        return;
      }

      clearInterval(timer);

      const assistant = {
        id: assistantId,
        conversationId,
        role: 'assistant',
        content: QA_REPLY,
        position: stored.length,
        model: 'qa-model',
        wire: 'anthropic',
        inputTokens: 128,
        outputTokens: words.length,
        status: 'ok',
        createdAt: now,
        // The same calls on the stored turn, so what the pane shows while the
        // reply arrives and what it shows on reload can be compared.
        toolCalls,
      };
      stored.push(assistant);

      response.write(`event: done\ndata: ${JSON.stringify(assistant)}\n\n`);
      response.end();
    }, 40);
  });
}

// Every line of a text as one kind of change.
//
// Only for the two kinds where that is the whole answer: a note being created
// is all additions and one being deleted is all removals. The others are
// written out, because a QA server standing in for the service must not stand
// in for the diff as well — a fixture that computed the comparison could agree
// with itself about a picture the real thing would never draw.
function everyLine(text, op) {
  return text.split('\n').map((line) => ({ op, text: line }));
}

// The five changes a model can ask for, and how to reach each one.
//
// Keyed off a word in the message so any of them can be got to on demand. A
// surface that can only be looked at when a real model happens to propose
// something is a surface nobody checks.
const PROPOSABLE = [
  {
    match: /\brename\b/i,
    tool: 'rename_note',
    kind: 'rename_note',
    text: 'I would call it something shorter. Nothing is renamed until you say so.',
    targetId: notes[1].id,
    title: notes[1].title,
    before: notes[1].title,
    after: 'Parser recovery',
    diff: [
      { op: 'remove', text: 'Parser recovery strategy' },
      { op: 'add', text: 'Parser recovery' },
    ],
  },
  {
    match: /\bdelete\b/i,
    tool: 'delete_note',
    kind: 'delete_note',
    text: 'This one looks finished with. Nothing is deleted until you say so.',
    targetId: notes[2].id,
    title: notes[2].title,
    before: notes[2].content,
    after: '',
    diff: everyLine(notes[2].content, 'remove'),
  },
  {
    match: /\b(new note|create)\b/i,
    tool: 'create_note',
    kind: 'create_note',
    text: 'Here is the note I would write. It does not exist until you say so.',
    // No target: there is nothing yet to point at.
    targetId: '',
    title: 'Lexer flush path',
    before: '',
    after: '# Lexer flush path\n\nFlush the buffered token when the reader returns EOF.',
    diff: everyLine(
      '# Lexer flush path\n\nFlush the buffered token when the reader returns EOF.',
      'add',
    ),
  },
  {
    match: /\btasks?\b/i,
    tool: 'edit_tasks',
    kind: 'edit_tasks',
    text: 'I would tick that one off. Nothing is written until you say so.',
    targetId: '',
    title: 'Task list',
    before: '- [ ] Ship it\n- [ ] Write the release notes\n',
    after: '- [x] Ship it\n- [ ] Write the release notes\n',
    diff: [
      { op: 'remove', text: '- [ ] Ship it' },
      { op: 'add', text: '- [x] Ship it' },
      { op: 'keep', text: '- [ ] Write the release notes' },
    ],
  },
  {
    // Last, and the loosest word, so the more specific ones win.
    match: /\bchange\b/i,
    tool: 'edit_note',
    kind: 'edit_note',
    text: 'Here is what I would add. Nothing is written until you say so.',
    targetId: notes[1].id,
    title: notes[1].title,
    before: proposedBefore,
    after: proposedAfter,
    diff: [
      { op: 'keep', text: '# Parser recovery strategy' },
      { op: 'keep', text: '' },
      { op: 'keep', text: 'Keep parsing after recoverable syntax errors.' },
      { op: 'add', text: '' },
      { op: 'add', text: 'Flush the buffered token when the reader returns EOF.' },
    ],
  },
];

/**
 * A turn that prepares a change and stops.
 *
 * The proposal goes out before done, so that by the time the pane holds the
 * finished turn it also holds the change that turn is waiting on — there is
 * never a render showing a stopped conversation with nothing to answer.
 */
function streamProposedChange(response, conversationId, assistantId, stored, asked) {
  const text = asked.text;
  const call = {
    id: `qa-call-${stored.length}`,
    name: asked.tool,
    input: JSON.stringify({ id: asked.targetId }),
    status: 'pending',
  };

  response.write(
    `event: tool\ndata: ${JSON.stringify({ name: call.name, input: call.input })}\n\n`,
  );
  response.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);

  const waiting = {
    id: `qa-proposal-${stored.length}`,
    conversationId,
    toolCallId: call.id,
    kind: asked.kind,
    targetId: asked.targetId,
    title: asked.title,
    before: asked.before,
    after: asked.after,
    diff: asked.diff,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  (chatProposals[conversationId] ??= []).push(waiting);

  const assistant = {
    id: assistantId,
    conversationId,
    role: 'assistant',
    content: text,
    position: stored.length,
    model: 'qa-model',
    wire: 'anthropic',
    status: 'ok',
    createdAt: new Date().toISOString(),
    toolCalls: [call],
  };
  stored.push(assistant);

  response.write(`event: proposal\ndata: ${JSON.stringify(waiting)}\n\n`);
  response.write(`event: done\ndata: ${JSON.stringify(assistant)}\n\n`);
  response.end();
}

/**
 * Answer a change and carry the conversation on, the way the service does.
 *
 * The decision is recorded before the stream opens, which is what lets the pane
 * move the card the moment the first event arrives — so the QA server has to do
 * it in that order too, or this surface is inspected in a state production
 * never reaches.
 *
 * There is no user message in the start event, because nobody said anything.
 */
function resolveChatProposal(request, response, conversationId, proposalId) {
  const waiting = (chatProposals[conversationId] ?? []).find((item) => item.id === proposalId);
  if (!waiting || waiting.status !== 'pending') {
    return sendJson(response, { error: 'that change was already answered' }, 409);
  }

  readBody(request, (body) => {
    const { decision } = JSON.parse(body || '{}');
    // What came of acting on it, not what was asked for. An apply the note
    // refused is recorded as failed, which is the whole reason the surface is
    // told the status rather than working it out from the decision it sent.
    const refused = decision === 'apply' && refusesToApply.has(waiting.id);
    waiting.status = decision !== 'apply' ? 'discarded' : refused ? 'failed' : 'applied';

    const stored = chatMessages[conversationId] ?? (chatMessages[conversationId] = []);
    const assistantId = `qa-assistant-${stored.length}`;

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.write(
      `event: start\ndata: ${JSON.stringify({ assistantMessageId: assistantId })}\n\n`,
    );

    // Where the card finds out. Written after start and before the reply, in
    // the order the service writes them.
    response.write(`event: proposal\ndata: ${JSON.stringify(waiting)}\n\n`);

    // In the words of the change that was actually answered. A reply that talks
    // about a note after somebody ticked off a task is the fixture undermining
    // the thing it exists to let somebody look at.
    const text = refused
      ? 'I could not write it — the note changed after I prepared this.'
      : decision === 'apply'
        ? (APPLIED_REPLY[waiting.kind] ?? 'Done.')
        : 'Understood. Nothing was written.';

    const assistant = {
      id: assistantId,
      conversationId,
      role: 'assistant',
      content: text,
      position: stored.length,
      model: 'qa-model',
      wire: 'anthropic',
      status: 'ok',
      createdAt: new Date().toISOString(),
    };
    stored.push(assistant);

    response.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
    response.write(`event: done\ndata: ${JSON.stringify(assistant)}\n\n`);
    response.end();
  });
}

// Collects a request body before acting on it. Node hands it over in pieces,
// and a handler that reads request.body finds nothing there.
function readBody(request, onBody) {
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => onBody(body));
}

function sendJson(response, value, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(value));
}

function qaApiPlugin() {
  return {
    name: 'dao-visual-qa-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        if (!url.pathname.startsWith('/api/')) return next();

        if (url.pathname === '/api/settings/working-directory') {
          return sendJson(response, {
            path: '/private/tmp/dao-ui-qa-workspace',
            configured: true,
          });
        }
        if (url.pathname === '/api/workspaces') {
          return sendJson(response, request.method === 'GET' ? [workspace] : workspace);
        }
        if (url.pathname === '/api/projects') {
          return sendJson(response, request.method === 'GET' ? [project] : project);
        }
        if (url.pathname === '/api/notes') {
          return sendJson(response, request.method === 'GET' ? notes : notes[0]);
        }
        if (url.pathname.startsWith('/api/notes/')) {
          return sendJson(
            response,
            notes.find((note) => url.pathname.includes(note.id)) ?? notes[0],
          );
        }
        // GET reads the document, PUT replaces its content and returns it.
        // There is no route below /api/tasks — the service has exactly these
        // two, because there is no task to address on its own.
        if (url.pathname === '/api/tasks') {
          if (request.method === 'GET') return sendJson(response, taskDocument);

          return readBody(request, (body) => {
            taskDocument.content = JSON.parse(body || '{}').content ?? '';
            sendJson(response, taskDocument);
          });
        }
        if (url.pathname === '/api/chats') {
          if (request.method === 'GET') return sendJson(response, conversations);

          const created = {
            id: `qa-chat-${conversations.length + 1}`,
            workspaceId: workspace.id,
            title: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          conversations.unshift(created);
          return sendJson(response, created, 201);
        }
        if (url.pathname.endsWith('/messages')) {
          const id = url.pathname.split('/').at(-2);
          return streamChatReply(request, response, id);
        }
        if (url.pathname.includes('/proposals/')) {
          const [id, proposalId] = url.pathname.slice('/api/chats/'.length).split('/proposals/');
          return resolveChatProposal(request, response, id, proposalId);
        }
        if (url.pathname.startsWith('/api/chats/')) {
          const id = url.pathname.slice('/api/chats/'.length);
          const conversation = conversations.find((item) => item.id === id);
          if (!conversation) return sendJson(response, { error: 'Not found' }, 404);

          if (request.method === 'DELETE') {
            conversations.splice(conversations.indexOf(conversation), 1);
            response.statusCode = 204;
            return response.end();
          }

          return sendJson(response, {
            ...conversation,
            messages: chatMessages[id] ?? [],
            proposals: chatProposals[id] ?? [],
          });
        }
        if (url.pathname === '/api/activities') return sendJson(response, activities);
        if (url.pathname === '/api/search') return sendJson(response, []);
        return sendJson(response, { error: 'Not found' }, 404);
      });
    },
  };
}

export default {
  ...baseConfig,
  plugins: [qaApiPlugin(), ...baseConfig.plugins],
  server: {
    ...baseConfig.server,
    proxy: undefined,
  },
};
