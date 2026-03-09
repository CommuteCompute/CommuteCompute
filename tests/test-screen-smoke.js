// Copyright (c) 2026 Angus Bergman
// Licensed under AGPL-3.0

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Validate the commutecompute endpoint handler can be imported
import handler from '../api/commutecompute.js';

describe('/api/commutecompute smoke test', () => {
  it('handler should be a default-exported function', () => {
    assert.equal(typeof handler, 'function',
      'api/commutecompute.js must export a default handler function');
  });
});
