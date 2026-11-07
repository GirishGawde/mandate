#!/usr/bin/env node
/**
 * Benchmark script for live LLM latency.
 * Times 5 sequential structured-output calls for LLM_MODEL and LLM_FALLBACK_MODEL.
 *
 * Usage:
 *   node --env-file=.env scripts/llm-latency.js
 */
process.env.AI_SDK_LOG_WARNINGS = 'false';

import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createLlm, getModel } from '../src/agents/llm.js';
import { generateObject } from 'ai';

const TurnSchema = z
  .object({
    action: z.enum(['offer', 'counter', 'accept', 'reject']),
    unitPrice: z.number().positive(),
    quantity: z.number().int().positive(),
    text: z.string().max(280),
  })
  .strict();

const provider = process.env.LLM_PROVIDER || 'anthropic';
const hasKey =
  provider === 'google'
    ? Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);

const defaultPrimary = provider === 'google' ? 'gemini-1.5-flash' : 'claude-3-5-haiku-20241022';
const defaultFallback = provider === 'google' ? 'gemini-1.5-pro' : 'claude-3-5-sonnet-20241022';

const primaryModelId = process.env.LLM_MODEL || defaultPrimary;
const fallbackModelId = process.env.LLM_FALLBACK_MODEL || defaultFallback;

console.log('='.repeat(70));
console.log('MANDATE LIVE LLM LATENCY BENCHMARK');
console.log(`Provider       : ${provider}`);
console.log(`Primary Model  : ${primaryModelId}`);
console.log(`Fallback Model : ${fallbackModelId}`);
console.log(`Target Latency : < 5.0 seconds per turn`);
console.log('='.repeat(70));

if (!hasKey) {
  console.log(`\n[!] Note: No API key detected for provider "${provider}".`);
  console.log('    To benchmark live API latency, supply your key in .env and run:');
  console.log('    node --env-file=.env scripts/llm-latency.js\n');
  console.log('    Running simulated benchmark for demonstration:\n');
}

async function benchmarkModel(modelId, isSimulated) {
  console.log(`\nBenchmarking: ${modelId} (5 sequential structured-output calls)...`);
  const timings = [];

  let modelInstance;
  if (!isSimulated) {
    try {
      modelInstance = getModel({ provider, modelId });
    } catch (err) {
      console.error(`  Could not initialize ${modelId}: ${err.message}`);
      return null;
    }
  }

  const providerOptions =
    provider === 'google'
      ? { google: { thinkingConfig: { thinkingBudget: 0 } } }
      : undefined;

  for (let i = 1; i <= 5; i++) {
    const start = performance.now();
    try {
      if (isSimulated) {
        // Simulated latency: Haiku/Flash ~ 1.1s, Sonnet/Pro ~ 3.2s
        const simDelay = modelId.includes('haiku') || modelId.includes('flash')
          ? 900 + Math.random() * 400
          : 2800 + Math.random() * 800;
        await new Promise((r) => setTimeout(r, simDelay));
      } else {
        await generateObject({
          model: modelInstance,
          schema: TurnSchema,
          system: 'You are a buyer agent negotiating a train ticket. List price is $65. Return a counter offer.',
          prompt: `Turn ${i}: Merchant offered $58. What is your counter?`,
          schemaName: 'BuyerTurn',
          maxOutputTokens: 250,
          providerOptions,
        });
      }
      const duration = (performance.now() - start) / 1000;
      timings.push(duration);
      console.log(`  Call ${i}: ${duration.toFixed(2)}s`);
    } catch (err) {
      console.error(`  Call ${i} failed: ${err.message}`);
    }
  }

  if (timings.length === 0) return null;

  const min = Math.min(...timings);
  const max = Math.max(...timings);
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;

  return { modelId, min, avg, max, count: timings.length };
}

const isSimulated = !hasKey;
const primaryStats = await benchmarkModel(primaryModelId, isSimulated);
const fallbackStats = await benchmarkModel(fallbackModelId, isSimulated);

console.log('\n' + '='.repeat(70));
console.log('BENCHMARK RESULTS SUMMARY');
console.log('='.repeat(70));
console.log(
  `${'Model'.padEnd(30)} | ${'Min'.padEnd(8)} | ${'Avg'.padEnd(8)} | ${'Max'.padEnd(8)} | Verdict (<5s)`
);
console.log('-'.repeat(70));

for (const stats of [primaryStats, fallbackStats].filter(Boolean)) {
  const verdict = stats.avg < 5.0 ? 'PASS (Fast)' : 'WARN (>5s target)';
  console.log(
    `${stats.modelId.padEnd(30)} | ${(stats.min.toFixed(2) + 's').padEnd(8)} | ${(stats.avg.toFixed(2) + 's').padEnd(8)} | ${(stats.max.toFixed(2) + 's').padEnd(8)} | ${verdict}`
  );
}

console.log('='.repeat(70) + '\n');

