import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlm, LlmUnavailableError } from '../src/agents/llm.js';
import { negotiate } from '../src/agents/negotiation.js';
import { buildBuyerPrompt } from '../src/agents/prompts/buyer.js';
import { generateBuyerTurn } from '../src/agents/buyerAgent.js';
import { CATALOG, getItem } from '../src/data/merchants.js';

// ==========================================
// 1. LLM Resilience: Primary -> Fallback Model
// ==========================================

test('when primary model fails with 503/429/timeout, fallback model is used and succeeds', async () => {
  const calls = [];

  const fakeRunner = async ({ model, schema, system, prompt }) => {
    calls.push(model.id);
    if (model.id === 'primary-model') {
      const err = new Error('503 Service Unavailable: Model is overloaded');
      err.status = 503;
      throw err;
    }
    if (model.id === 'fallback-model') {
      return {
        object: {
          action: 'offer',
          unitPrice: 50,
          quantity: 1,
          text: 'Fallback model offer',
        },
      };
    }
    throw new Error(`Unexpected model: ${model.id}`);
  };

  const llm = createLlm({
    mode: 'live',
    primaryModelInstance: { id: 'primary-model', modelId: 'primary-model' },
    fallbackModelInstance: { id: 'fallback-model', modelId: 'fallback-model' },
    maxRetries: 2,
    initialBackoffMs: 1,
    generateObjectFn: fakeRunner,
  });

  const result = await llm.generateObject({
    schema: {},
    system: 'system',
    prompt: 'hello',
  });

  assert.ok(result.object);
  assert.equal(result.object.text, 'Fallback model offer');
  // Primary was tried first, then fallback
  assert.ok(calls.includes('primary-model'));
  assert.ok(calls.includes('fallback-model'));
});

// ==========================================
// 2. LLM Resilience: Both Fail -> LLM_UNAVAILABLE
// ==========================================

test('when both primary and fallback fail, throws typed LLM_UNAVAILABLE error', async () => {
  const fakeRunner = async ({ model }) => {
    const err = new Error(`${model.id} failed with 429 Too Many Requests`);
    err.status = 429;
    throw err;
  };

  const llm = createLlm({
    mode: 'live',
    primaryModelInstance: { id: 'primary-model', modelId: 'primary-model' },
    fallbackModelInstance: { id: 'fallback-model', modelId: 'fallback-model' },
    maxRetries: 2,
    initialBackoffMs: 1,
    generateObjectFn: fakeRunner,
  });

  await assert.rejects(
    llm.generateObject({ schema: {}, system: '', prompt: '' }),
    (err) => {
      assert.equal(err.name, 'LLM_UNAVAILABLE');
      assert.equal(err.code, 'LLM_UNAVAILABLE');
      assert.ok(err instanceof LlmUnavailableError);
      return true;
    }
  );
});

// ==========================================
// 3. Negotiation Catch: Scripted Replay With Notice
// ==========================================

test('negotiation catches LLM_UNAVAILABLE and replays scripted transcript with visible notice', async () => {
  const item = getItem('train-london-paris');
  const emittedMessages = [];

  // Buyer LLM throws LLM_UNAVAILABLE
  const failingBuyerLlm = {
    mode: 'live',
    async generateObject() {
      throw new LlmUnavailableError('Live API is overloaded (503 Service Unavailable)');
    },
  };

  const result = await negotiate({
    item,
    buyerLlm: failingBuyerLlm,
    merchantLlm: failingBuyerLlm,
    onMessage: (msg) => emittedMessages.push(msg),
  });

  // Must not crash; must complete successfully via scripted replay
  assert.equal(result.status, 'deal');
  assert.ok(result.deal);
  assert.equal(result.deal.unitPrice, 55);

  // Must NOT fall back silently: visible notice MUST be present
  assert.equal(result.notice, 'Live AI unavailable, replaying scripted negotiation.');

  const noticeInTranscript = result.transcript.find(
    (m) => m.from === 'system' && m.action === 'notice'
  );
  assert.ok(noticeInTranscript, 'Notice message must be present in transcript');
  assert.equal(noticeInTranscript.text, 'Live AI unavailable, replaying scripted negotiation.');

  // onMessage callback must have received the notice
  assert.ok(
    emittedMessages.some((m) => m.text.includes('Live AI unavailable, replaying scripted negotiation.'))
  );

  // Logs must record the fallback intervention
  const fallbackLog = result.logs.find((l) => l.type === 'llm_unavailable_fallback');
  assert.ok(fallbackLog, 'Log must contain llm_unavailable_fallback event');
});

// ==========================================
// 4. Invariant: Floor Price Never Leaked to Buyer
// ==========================================

test('merchant floorPrice is never included in any buyer-agent prompt or context', async () => {
  for (const item of CATALOG) {
    const prompt = buildBuyerPrompt({
      goal: 'Find the best deal',
      mandate: {
        currency: 'USD',
        monthlyCap: 500,
        perPurchaseCap: 200,
        approvalThreshold: 100,
        allowedCategories: [item.category],
        allowSubscriptions: false,
        blockedKeywords: [],
      },
      item,
    });

    // The floor price number must NOT appear in the prompt
    assert.equal(
      prompt.toLowerCase().includes(`floor`),
      false,
      `Buyer prompt leaked "floor" word for item ${item.id}`
    );
    assert.equal(
      prompt.includes(`floorPrice`),
      false,
      `Buyer prompt leaked "floorPrice" key for item ${item.id}`
    );
  }

  // Also verify generateBuyerTurn scrubs floorPrice from live LLM context
  let inspectedSystem = '';
  const spyLlm = {
    mode: 'live',
    async generateObject({ system }) {
      inspectedSystem = system;
      return {
        object: {
          action: 'offer',
          unitPrice: 50,
          quantity: 1,
          text: 'Offer $50',
        },
      };
    },
  };

  const testItem = getItem('train-london-paris'); // floorPrice is 48
  await generateBuyerTurn({ item: testItem, llm: spyLlm });

  assert.equal(inspectedSystem.toLowerCase().includes('floor'), false);
  assert.equal(inspectedSystem.includes('48'), false);
});

// ==========================================
// 5. Latency & Message Source Guardrails
// ==========================================

test('timeout is configurable via LLM_TIMEOUT_MS with default 30000ms', () => {
  const prevEnv = process.env.LLM_TIMEOUT_MS;
  try {
    delete process.env.LLM_TIMEOUT_MS;
    const defaultLlm = createLlm({ mode: 'live', primaryModelInstance: { id: 'm', modelId: 'm' } });
    assert.equal(defaultLlm.timeoutMs, 30_000);

    process.env.LLM_TIMEOUT_MS = '15000';
    const customLlm = createLlm({ mode: 'live', primaryModelInstance: { id: 'm', modelId: 'm' } });
    assert.equal(customLlm.timeoutMs, 15_000);
  } finally {
    if (prevEnv !== undefined) process.env.LLM_TIMEOUT_MS = prevEnv;
    else delete process.env.LLM_TIMEOUT_MS;
  }
});

test('notice message must have NO price and NO quantity fields', async () => {
  const { validateNegotiationMessage } = await import('../src/agents/messageSchema.js');

  // Valid notice
  const validNotice = {
    from: 'system',
    action: 'notice',
    text: 'Live AI unavailable, replaying scripted negotiation.',
  };
  assert.equal(validateNegotiationMessage(validNotice).success, true);

  // Illegal: notice with price
  const withPrice = { ...validNotice, unitPrice: 50 };
  assert.equal(validateNegotiationMessage(withPrice).success, false);

  // Illegal: notice with quantity
  const withQty = { ...validNotice, quantity: 1 };
  assert.equal(validateNegotiationMessage(withQty).success, false);
});

test('on fallback, partial live messages are discarded so transcript is never mixed', async () => {
  const item = getItem('train-london-paris');
  let buyerCallCount = 0;

  // Buyer succeeds on first turn (live), merchant fails with LLM_UNAVAILABLE
  const partialLiveBuyerLlm = {
    mode: 'live',
    async generateObject() {
      buyerCallCount++;
      return {
        object: {
          action: 'offer',
          unitPrice: 50,
          quantity: 1,
          text: 'Opening live offer',
        },
      };
    },
  };

  const failingMerchantLlm = {
    mode: 'live',
    async generateObject() {
      throw new LlmUnavailableError('Merchant model 503 Overloaded');
    },
  };

  const result = await negotiate({
    item,
    buyerLlm: partialLiveBuyerLlm,
    merchantLlm: failingMerchantLlm,
  });

  assert.equal(result.status, 'deal');
  assert.ok(result.notice);

  // First message must be the notice
  assert.equal(result.transcript[0].from, 'system');
  assert.equal(result.transcript[0].action, 'notice');
  assert.equal(result.transcript[0].unitPrice, undefined);
  assert.equal(result.transcript[0].quantity, undefined);

  // Zero messages with source: 'live' in the final transcript (partial live was discarded!)
  const liveMessages = result.transcript.filter((m) => m.source === 'live');
  assert.equal(liveMessages.length, 0, 'Transcript must not contain partial live messages after fallback');

  // All deal messages must be scripted
  const agentMessages = result.transcript.filter((m) => m.from !== 'system');
  assert.ok(agentMessages.length > 0);
  assert.ok(agentMessages.every((m) => m.source === 'scripted'));
});


