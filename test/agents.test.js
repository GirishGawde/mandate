import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MERCHANTS, CATALOG, getMerchant, getItem, getItemFloorPrice, searchCatalog } from '../src/data/merchants.js';
import { createLlm, getModel } from '../src/agents/llm.js';
import { parseMandate, validateParsedMandate, parseMandateScripted } from '../src/agents/mandateParser.js';

// ==========================================
// 1. Mock Catalog & Merchant Rules Tests
// ==========================================

test('merchant catalog has 3-5 merchants across travel and electronics, plus one shady merchant', () => {
  assert.ok(MERCHANTS.length >= 3 && MERCHANTS.length <= 5, `Expected 3-5 merchants, got ${MERCHANTS.length}`);

  const categories = new Set(MERCHANTS.map((m) => m.category));
  assert.ok(categories.has('travel'), 'Missing travel merchant category');
  assert.ok(categories.has('electronics'), 'Missing electronics merchant category');

  const shadyMerchants = MERCHANTS.filter((m) => m.isShady);
  assert.equal(shadyMerchants.length, 1, 'Expected exactly one shady merchant');
  assert.equal(shadyMerchants[0].id, 'shady-deals');

  // Shady merchant must contain a subscription item for the attack scenario
  const subItem = shadyMerchants[0].items.find((i) => i.isSubscription);
  assert.ok(subItem, 'Shady merchant must have an item with isSubscription=true');
});

test('every catalog item defines listPrice, floorPrice, and bulk tiers', () => {
  assert.ok(CATALOG.length >= 6, 'Expected at least 6 catalog items');

  for (const item of CATALOG) {
    assert.ok(item.id, 'Item must have an id');
    assert.ok(item.merchantId, 'Item must have a merchantId');
    assert.ok(item.name, 'Item must have a name');
    assert.ok(['travel', 'electronics'].includes(item.category), `Unexpected category: ${item.category}`);
    assert.ok(typeof item.listPrice === 'number' && item.listPrice > 0, `Invalid listPrice on ${item.id}`);
    assert.ok(typeof item.floorPrice === 'number' && item.floorPrice > 0, `Invalid floorPrice on ${item.id}`);
    assert.ok(item.floorPrice <= item.listPrice, `floorPrice (${item.floorPrice}) cannot exceed listPrice (${item.listPrice}) on ${item.id}`);
    assert.ok(Array.isArray(item.bulk), `bulk tiers must be an array on ${item.id}`);
    assert.equal(typeof item.isSubscription, 'boolean', `isSubscription must be boolean on ${item.id}`);
  }
});

test('catalog query helpers find items and merchants correctly', () => {
  const acme = getMerchant('acme-travel');
  assert.ok(acme);
  assert.equal(acme.name, 'Acme Travel');

  const item = getItem('train-london-paris');
  assert.ok(item);
  assert.equal(item.category, 'travel');

  const floor = getItemFloorPrice('train-london-paris');
  assert.equal(floor, item.floorPrice);

  const searchResults = searchCatalog({ category: 'travel', maxPrice: 70 });
  assert.ok(searchResults.length > 0);
  assert.ok(searchResults.every((i) => i.category === 'travel' && i.listPrice <= 70));
});

// ==========================================
// 2. Mandate Parser Tests (with Injected LLM)
// ==========================================

test('missing caps go to unclear with no invented numbers', async () => {
  // A fake LLM that extracts user text with missing caps
  const fakeLlm = {
    mode: 'live',
    async generateObject() {
      return {
        object: {
          mandate: {
            version: 1,
            currency: 'USD',
            // monthlyCap, perPurchaseCap, approvalThreshold NOT specified by user
            allowedCategories: ['travel'],
            blockedCategories: [],
            allowedMerchants: [],
            blockedMerchants: [],
            allowSubscriptions: false,
            blockedKeywords: ['subscription', 'free trial', 'recurring'],
          },
          assumptions: ['Defaulted currency to USD'],
          unclear: [],
        },
      };
    },
  };

  const result = await parseMandate('Spend only on travel, no subscriptions', { llm: fakeLlm });

  // Missing caps must NOT be invented
  assert.equal(result.mandate.monthlyCap, undefined, 'monthlyCap was invented');
  assert.equal(result.mandate.perPurchaseCap, undefined, 'perPurchaseCap was invented');
  assert.equal(result.mandate.approvalThreshold, undefined, 'approvalThreshold was invented');

  // Missing caps must be placed in unclear
  assert.ok(
    result.unclear.some((u) => u.toLowerCase().includes('monthlycap')),
    'Expected monthlyCap in unclear'
  );
  assert.ok(
    result.unclear.some((u) => u.toLowerCase().includes('perpurchasecap')),
    'Expected perPurchaseCap in unclear'
  );
  assert.ok(
    result.unclear.some((u) => u.toLowerCase().includes('approvalthreshold')),
    'Expected approvalThreshold in unclear'
  );
});

test('when some caps are present, missing ones go to unclear without inventing values', async () => {
  const fakeLlm = {
    mode: 'live',
    async generateObject() {
      return {
        object: {
          mandate: {
            version: 1,
            currency: 'USD',
            monthlyCap: 250,
            // perPurchaseCap and approvalThreshold omitted
            allowedCategories: ['electronics'],
            blockedCategories: [],
            allowedMerchants: [],
            blockedMerchants: [],
            allowSubscriptions: false,
            blockedKeywords: [],
          },
          assumptions: [],
          unclear: [],
        },
      };
    },
  };

  const result = await parseMandate('Up to $250 a month on electronics', { llm: fakeLlm });
  assert.equal(result.mandate.monthlyCap, 250);
  assert.equal(result.mandate.perPurchaseCap, undefined, 'perPurchaseCap was invented');
  assert.equal(result.mandate.approvalThreshold, undefined, 'approvalThreshold was invented');

  assert.ok(result.unclear.some((u) => u.toLowerCase().includes('perpurchasecap')));
  assert.ok(result.unclear.some((u) => u.toLowerCase().includes('approvalthreshold')));
});

test('invalid LLM output triggers one retry, then an error if retry also fails', async () => {
  let callCount = 0;

  // Fake LLM returning incoherent numbers violating perPurchaseCap <= monthlyCap
  const fakeLlm = {
    mode: 'live',
    async generateObject() {
      callCount++;
      return {
        object: {
          mandate: {
            version: 1,
            currency: 'USD',
            monthlyCap: 100,
            perPurchaseCap: 500, // Invalid: exceeds monthlyCap!
            approvalThreshold: 50,
            allowedCategories: [],
            blockedCategories: [],
            allowedMerchants: [],
            blockedMerchants: [],
            allowSubscriptions: false,
            blockedKeywords: [],
          },
          assumptions: [],
          unclear: [],
        },
      };
    },
  };

  await assert.rejects(
    parseMandate('Spend up to $100 a month with $500 per purchase', { llm: fakeLlm }),
    /Failed to parse mandate after retry/
  );

  // Initial call (1) + exactly one retry (1) = 2 calls
  assert.equal(callCount, 2, `Expected exactly 2 attempts (1 initial + 1 retry), got ${callCount}`);
});

test('invalid LLM output triggers one retry, and succeeds if the retry fixes the issue', async () => {
  let callCount = 0;

  const fakeLlm = {
    mode: 'live',
    async generateObject() {
      callCount++;
      if (callCount === 1) {
        // Attempt 1: Invalid (approvalThreshold > perPurchaseCap)
        return {
          object: {
            mandate: {
              version: 1,
              currency: 'USD',
              monthlyCap: 200,
              perPurchaseCap: 100,
              approvalThreshold: 150, // Invalid!
              allowedCategories: ['travel'],
              blockedCategories: [],
              allowedMerchants: [],
              blockedMerchants: [],
              allowSubscriptions: false,
              blockedKeywords: [],
            },
            assumptions: [],
            unclear: [],
          },
        };
      }
      // Attempt 2 (Retry): Corrected
      return {
        object: {
          mandate: {
            version: 1,
            currency: 'USD',
            monthlyCap: 200,
            perPurchaseCap: 100,
            approvalThreshold: 50, // Fixed!
            allowedCategories: ['travel'],
            blockedCategories: [],
            allowedMerchants: [],
            blockedMerchants: [],
            allowSubscriptions: false,
            blockedKeywords: [],
          },
          assumptions: [],
          unclear: [],
        },
      };
    },
  };

  const result = await parseMandate('Spend up to $200 a month on travel, ask above $50', { llm: fakeLlm });
  assert.equal(callCount, 2, 'Expected retry to occur');
  assert.equal(result.mandate.monthlyCap, 200);
  assert.equal(result.mandate.perPurchaseCap, 100);
  assert.equal(result.mandate.approvalThreshold, 50);
});

// ==========================================
// 3. Scripted Mode Tests (No API Calls)
// ==========================================

test('scripted mode makes no API calls', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch called during scripted mode!');
  };

  try {
    const scriptedLlm = createLlm({ mode: 'scripted' });
    assert.equal(scriptedLlm.mode, 'scripted');

    const result = await parseMandate(
      'up to $200/month on travel and electronics, ask me above $50, never subscriptions',
      { llm: scriptedLlm }
    );

    assert.equal(fetchCalled, false, 'Network fetch was called in scripted mode!');
    assert.equal(result.mandate.monthlyCap, 200);
    assert.equal(result.mandate.approvalThreshold, 50);
    assert.equal(result.mandate.perPurchaseCap, undefined, 'perPurchaseCap was not specified and should not be invented');
    assert.ok(result.unclear.some((u) => u.toLowerCase().includes('perpurchasecap')));
    assert.ok(result.mandate.allowedCategories.includes('travel'));
    assert.ok(result.mandate.allowedCategories.includes('electronics'));
    assert.equal(result.mandate.allowSubscriptions, false);
    assert.ok(result.mandate.blockedKeywords.includes('subscription'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ==========================================
// 4. LLM Provider Selection Tests
// ==========================================

test('createLlm configures provider and model based on parameters and env', () => {
  const anthropicLlm = createLlm({ provider: 'anthropic', model: 'claude-3-5-haiku-20241022', mode: 'scripted' });
  assert.equal(anthropicLlm.mode, 'scripted');

  const googleModel = getModel({ provider: 'google', modelId: 'gemini-1.5-flash', apiKey: 'test-key' });
  assert.equal(googleModel.modelId, 'gemini-1.5-flash');

  assert.throws(() => getModel({ provider: 'invalid-provider' }), /Unsupported LLM provider/);
});

// ==========================================
// 5. Invariant: Agents Hold No Payment Tools
// ==========================================

test('agents layer does not import payments.js, paypal/, or ledger.js (Invariant 2)', () => {
  const llmCode = readFileSync(new URL('../src/agents/llm.js', import.meta.url), 'utf8');
  const parserCode = readFileSync(new URL('../src/agents/mandateParser.js', import.meta.url), 'utf8');

  for (const forbidden of ['payments', 'paypal', 'ledger']) {
    const regex = new RegExp(`from\\s+['"].*${forbidden}.*['"]`);
    assert.ok(!regex.test(llmCode), `src/agents/llm.js illegally imports ${forbidden}`);
    assert.ok(!regex.test(parserCode), `src/agents/mandateParser.js illegally imports ${forbidden}`);
  }
});

