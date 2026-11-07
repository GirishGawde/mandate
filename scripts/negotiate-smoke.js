#!/usr/bin/env node
/**
 * Smoke script for the negotiation layer.
 *
 * Usage:
 *   node scripts/negotiate-smoke.js                    # Scripted normal negotiation
 *   node scripts/negotiate-smoke.js --attack           # Scripted shady merchant attack
 *   node --env-file=.env scripts/negotiate-smoke.js --live    # Live LLM negotiation (requires API key)
 */
process.env.AI_SDK_LOG_WARNINGS = 'false';

import { negotiate } from '../src/agents/negotiation.js';
import { buildPurchaseProposal } from '../src/agents/proposalBuilder.js';
import { getItem, CATALOG } from '../src/data/merchants.js';
import { createLlm } from '../src/agents/llm.js';

const isLive = process.argv.includes('--live');
const isAttack = process.argv.includes('--attack');

console.log('='.repeat(70));
console.log(`MANDATE NEGOTIATION SMOKE TEST`);
console.log(`Mode   : ${isLive ? 'LIVE (Real LLM Calls)' : 'SCRIPTED (Deterministic Canned Transcript)'}`);
console.log(`Scenario: ${isAttack ? 'SHADY MERCHANT ATTACK' : 'NORMAL HONEST DEAL'}`);
console.log('='.repeat(70));

const item = isAttack
  ? getItem('vip-priority-pass')
  : getItem('train-london-paris') || CATALOG[0];

console.log(`\nCatalog Item:`);
console.log(`  ID         : ${item.id}`);
console.log(`  Name       : ${item.name}`);
console.log(`  Category   : ${item.category}`);
console.log(`  List Price : $${item.listPrice}`);
console.log(`  Floor Price: $${item.floorPrice}`);
console.log(`  Subscription: ${item.isSubscription ? 'YES (Recurring)' : 'No'}`);

const mandate = {
  monthlyCap: 200,
  perPurchaseCap: 100,
  approvalThreshold: 50,
  allowedCategories: ['travel', 'electronics'],
  allowSubscriptions: false,
  blockedKeywords: ['subscription', 'free trial', 'recurring'],
};

let buyerLlm;
let merchantLlm;

if (isLive) {
  const provider = process.env.LLM_PROVIDER || 'anthropic';
  const hasKey =
    provider === 'google'
      ? process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
      : process.env.ANTHROPIC_API_KEY;

  if (!hasKey) {
    console.error(`\n[!] Live mode requested, but no API key found for provider "${provider}".`);
    console.error(`    Set ANTHROPIC_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in your .env file.`);
    console.error(`    Falling back to scripted mode for this run.\n`);
    buyerLlm = createLlm({ mode: 'scripted' });
    merchantLlm = createLlm({ mode: 'scripted' });
  } else {
    buyerLlm = createLlm({ mode: 'live' });
    merchantLlm = createLlm({ mode: 'live' });
  }
} else {
  buyerLlm = createLlm({ mode: 'scripted' });
  merchantLlm = createLlm({ mode: 'scripted' });
}

console.log('\n--- Negotiation Transcript ---');

const result = await negotiate({
  item,
  goal: isAttack ? 'Inquire about VIP club membership' : 'Book a train ticket under $60',
  mandate,
  buyerLlm,
  merchantLlm,
  persona: isAttack ? 'shady' : 'honest',
  attack: isAttack,
  mode: isLive && buyerLlm.mode === 'live' ? 'live' : 'scripted',
  onMessage: (msg) => {
    const fromLabel = msg.from.toUpperCase().padEnd(8);
    const actionLabel = `[${msg.action.toUpperCase()} $${msg.unitPrice} x${msg.quantity}]`;
    console.log(`\n  ${fromLabel} ${actionLabel}`);
    console.log(`    "${msg.text}"`);
  },
});

console.log('\n' + '-'.repeat(70));
console.log(`Negotiation Result: ${result.status.toUpperCase()}`);
console.log(`Total Rounds      : ${result.rounds}`);

if (result.logs.length > 0) {
  console.log(`\nGuardrail Interventions Logged (${result.logs.length}):`);
  for (const log of result.logs) {
    console.log(`  - [${log.type}] ${JSON.stringify(log)}`);
  }
}

if (result.status === 'deal' && result.deal) {
  console.log(`\nAgreed Terms:`);
  console.log(`  Unit Price : $${result.deal.unitPrice}`);
  console.log(`  Quantity   : ${result.deal.quantity}`);
  console.log(`  Total      : $${result.deal.total}`);

  console.log(`\nBuilding PurchaseProposal via proposalBuilder (code enforcement):`);
  const proposal = buildPurchaseProposal({ item, deal: result.deal });
  console.log(JSON.stringify(proposal, null, 2));
  console.log('\nInvariant Verified: Category, description, and isSubscription locked to catalog.');
} else {
  console.log(`Reason: ${result.reason}`);
}

console.log('='.repeat(70) + '\n');

