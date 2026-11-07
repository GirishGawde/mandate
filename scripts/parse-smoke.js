#!/usr/bin/env node
/**
 * Smoke script for the mandate parser.
 * Runs the mandate parser on sample user input and prints the parsed mandate, assumptions, and unclear fields.
 *
 * Usage:
 *   node scripts/parse-smoke.js                          # Scripted / auto-detect
 *   node --env-file=.env scripts/parse-smoke.js          # Uses live provider credentials if configured
 *   node --env-file=.env scripts/parse-smoke.js --live   # Forces live LLM parsing
 */
process.env.AI_SDK_LOG_WARNINGS = 'false';

import { parseMandate } from '../src/agents/mandateParser.js';
import { createLlm } from '../src/agents/llm.js';

const sampleInput =
  'Up to $200/month on travel and electronics, ask me above $50, never subscriptions.';

console.log('='.repeat(70));
console.log('MANDATE PARSER SMOKE TEST');
console.log('Input Text:');
console.log(`  "${sampleInput}"`);
console.log('='.repeat(70));

const provider = process.env.LLM_PROVIDER || 'anthropic';
const hasKey =
  provider === 'google'
    ? Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);

const forceLive = process.argv.includes('--live');
const shouldAttemptLive = forceLive || hasKey;

let llm;
if (shouldAttemptLive) {
  console.log(`\nMode: LIVE (Provider: ${provider}, Model: ${process.env.LLM_MODEL || 'default'})`);
  llm = createLlm({ mode: 'live' });
} else {
  console.log('\nMode: SCRIPTED (No API key found in environment; running deterministic parser)');
  llm = createLlm({ mode: 'scripted' });
}

try {
  const result = await parseMandate(sampleInput, { llm });

  console.log('\n--- PARSED MANDATE DRAFT ---');
  console.log(JSON.stringify(result.mandate, null, 2));

  console.log('\n--- ASSUMPTIONS ---');
  if (result.assumptions.length === 0) {
    console.log('  (None)');
  } else {
    for (const a of result.assumptions) {
      console.log(`  - ${a}`);
    }
  }

  console.log('\n--- UNCLEAR (Requires User Confirmation in UI) ---');
  if (result.unclear.length === 0) {
    console.log('  (None)');
  } else {
    for (const u of result.unclear) {
      console.log(`  - ${u}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUCCESS: Mandate parsed and validated.');
  console.log('='.repeat(70) + '\n');
} catch (err) {
  console.error('\nFAILED TO PARSE MANDATE:', err.message);
  if (err.name === 'LLM_UNAVAILABLE') {
    console.log('\nLive AI model was unavailable. Falling back to deterministic extraction:\n');
    const fallbackLlm = createLlm({ mode: 'scripted' });
    const fallbackResult = await parseMandate(sampleInput, { llm: fallbackLlm });
    console.log(JSON.stringify(fallbackResult, null, 2));
  } else {
    process.exitCode = 1;
  }
}

