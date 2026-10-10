import { describe, it, expect } from 'vitest';
import { scanTranscriptForPricingLeaks, scanAgentText } from './pricing';

describe('pricing guardrail — no false positives on legitimate agent lines', () => {
  const clean = [
    'Front Desk: We do commercial fitouts up to about 3,000 sq ft.',
    'Front Desk: a room redesign with execution takes at least 8–10 weeks.',
    'Front Desk: Our commercial projects are typically 500 sq ft or more.',
    'Front Desk: A 180 sq ft pod is below our minimum scope.',
    'Front Desk: the difference between a standard and a premium kitchen alone can be 3× the cost.',
    'Front Desk: workstations for 20 people, a small cabin.',
    'Front Desk: We have a 3BHK, about 1,400 sq ft carpet.',
    'Front Desk: Pricing depends on the site, the materials you choose, and the scope.',
  ];
  for (const line of clean) {
    it(`clean: ${line.slice(12, 48)}…`, () => {
      expect(scanTranscriptForPricingLeaks(line)).toEqual([]);
    });
  }
});

describe('pricing guardrail — a caller stating their own budget is not a leak', () => {
  it('caller budget line ignored', () => {
    expect(
      scanTranscriptForPricingLeaks('Caller: My budget is 1 to 1.5 lakh maximum for everything.'),
    ).toEqual([]);
  });
});

describe('pricing guardrail — catches real leaks from the agent', () => {
  const leaks = [
    'Front Desk: It typically costs around 2 lakh for a 2BHK.',
    'Front Desk: Our rates start at ₹1,800 per sq ft.',
    'Front Desk: For a standard spec it is about 1800 per sq ft.',
    'Front Desk: That would be roughly 8 lakh all-in.',
    'Agent: Expect around Rs 2,50,000 for the kitchen.',
  ];
  for (const line of leaks) {
    it(`leak: ${line.slice(12, 48)}…`, () => {
      expect(scanTranscriptForPricingLeaks(line).length).toBeGreaterThan(0);
    });
  }
});

describe('pricing guardrail — scanAgentText direct', () => {
  it('flags per-sq-ft', () => {
    expect(scanAgentText('around 2400 per sq ft').length).toBeGreaterThan(0);
  });
});
