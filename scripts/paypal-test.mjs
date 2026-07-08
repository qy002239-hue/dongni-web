import assert from 'node:assert/strict';
import { getPayPalPlan, parseCustomId } from '../api/_paypal.js';
import { grantCreditsForApprovedPayment } from '../api/_payment-grant.js';

function createSupabaseMock({
  duplicateVia = '',
  rpcResponses = []
} = {}) {
  let rpcCallIndex = 0;

  return {
    from(tableName) {
      assert.equal(tableName, 'dongni_payments');
      return {
        select() {
          return this;
        },
        eq(columnName, value) {
          this.columnName = columnName;
          this.value = value;
          return this;
        },
        async limit() {
          if (duplicateVia && this.columnName === duplicateVia) {
            return { data: [{ id: 1 }], error: null };
          }
          return { data: [], error: null };
        }
      };
    },
    async rpc(functionName, payload) {
      assert.equal(functionName, 'grant_dongni_purchase');
      const next = rpcResponses[rpcCallIndex] ?? { data: { ok: true }, error: null };
      rpcCallIndex += 1;
      if (typeof next.assertPayload === 'function') {
        next.assertPayload(payload);
      }
      return { data: next.data ?? null, error: next.error ?? null };
    }
  };
}

async function testPlanMapping() {
  const single = getPayPalPlan('dongni-plus-single');
  const pack = getPayPalPlan('dongni-plus-six-pack');
  const invalid = getPayPalPlan('nope');

  assert.equal(single?.credits, 1);
  assert.equal(single?.amount, '200');
  assert.equal(pack?.credits, 6);
  assert.equal(pack?.amount, '1000');
  assert.equal(invalid, null);
}

async function testCustomIdParsing() {
  const json = parseCustomId(JSON.stringify({ userId: 'u1', plan: 'dongni-plus-single' }));
  const legacy = parseCustomId('u2:dongni-plus-six-pack');
  const invalid = parseCustomId('bad-value');

  assert.deepEqual(json, { userId: 'u1', plan: 'dongni-plus-single' });
  assert.deepEqual(legacy, { userId: 'u2', plan: 'dongni-plus-six-pack' });
  assert.equal(invalid, null);
}

async function testGrantSuccess() {
  const supabase = createSupabaseMock({
    rpcResponses: [{
      data: { granted: true },
      assertPayload(payload) {
        assert.equal(payload.p_user_id, 'user-a');
        assert.equal(payload.p_plan_id, 'dongni-plus-single');
      }
    }]
  });

  const result = await grantCreditsForApprovedPayment(supabase, {
    userId: 'user-a',
    plan: 'dongni-plus-single',
    orderId: 'ORDER-1',
    captureId: 'CAP-1',
    amount: '200',
    currency: 'TWD'
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.creditsGranted, 1);
}

async function testGrantDuplicateOrder() {
  const supabase = createSupabaseMock({ duplicateVia: 'paypal_order_id' });

  const result = await grantCreditsForApprovedPayment(supabase, {
    userId: 'user-a',
    plan: 'dongni-plus-single',
    orderId: 'ORDER-2',
    captureId: 'CAP-2',
    amount: '200',
    currency: 'TWD'
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.creditsGranted, 0);
}

async function testGrantFallbackRpcPayloads() {
  const retryableError = {
    code: 'PGRST202',
    message: 'function signature mismatch'
  };

  const supabase = createSupabaseMock({
    rpcResponses: [
      { error: retryableError },
      { error: retryableError },
      {
        data: { granted: true },
        assertPayload(payload) {
          assert.equal(payload.plan, 'dongni-plus-six-pack');
          assert.equal(payload.order_id, 'ORDER-3');
        }
      }
    ]
  });

  const result = await grantCreditsForApprovedPayment(supabase, {
    userId: 'user-b',
    plan: 'dongni-plus-six-pack',
    orderId: 'ORDER-3',
    captureId: 'CAP-3',
    amount: '1000',
    currency: 'TWD'
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.creditsGranted, 6);
}

async function testGrantHardFailure() {
  const supabase = createSupabaseMock({
    rpcResponses: [{
      error: {
        code: 'XX000',
        message: 'db failure'
      }
    }]
  });

  const result = await grantCreditsForApprovedPayment(supabase, {
    userId: 'user-c',
    plan: 'dongni-plus-single',
    orderId: 'ORDER-4',
    captureId: 'CAP-4',
    amount: '200',
    currency: 'TWD'
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
}

async function main() {
  await testPlanMapping();
  await testCustomIdParsing();
  await testGrantSuccess();
  await testGrantDuplicateOrder();
  await testGrantFallbackRpcPayloads();
  await testGrantHardFailure();
  console.log('PayPal tests: PASS');
}

main().catch((error) => {
  console.error('PayPal tests: FAIL');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
