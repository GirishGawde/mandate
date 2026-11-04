// Proves the real PayPal sandbox flow end to end, using src/paypal/real.js.
//
//   node --env-file=.env scripts/sandbox-smoke.js          # create -> approve -> authorize -> capture
//   node --env-file=.env scripts/sandbox-smoke.js --void   # create -> approve -> authorize -> void
//
// Needs in .env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET (sandbox app credentials).
// You will be asked to open an approval link and log in as the SANDBOX BUYER (personal) account.
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomUUID } from 'node:crypto';
import { createRealClient } from '../src/paypal/real.js';

const doVoid = process.argv.includes('--void');
const step = (n, msg) => console.log(`\n[${n}] ${msg}`);

let paypal;
try {
  paypal = createRealClient();
} catch (e) {
  console.error(`\nSetup problem: ${e.message}`);
  process.exit(1);
}

const rl = readline.createInterface({ input, output });

try {
  step(1, 'Creating a sandbox order (intent AUTHORIZE, USD 10.00)...');
  const order = await paypal.createOrder({
    referenceId: randomUUID(),
    amount: 10,
    currency: 'USD',
    description: 'Mandate sandbox smoke test',
  });
  console.log('    order id :', order.id);
  console.log('    status   :', order.status);
  if (!order.approveUrl) throw new Error('No approval link returned. Check the order response shape in real.js.');

  step(2, 'Open this link in a browser and log in as the SANDBOX BUYER (personal) account, then approve:');
  console.log('\n    ' + order.approveUrl + '\n');
  console.log('    (After approving, PayPal redirects to the return URL. That page may not exist yet -- that is fine.)');

  while (true) {
    await rl.question('    Press Enter here once you have approved in your browser... ');
    const check = await paypal.getOrder(order.id);
    if (check.status === 'APPROVED') {
      console.log('    Order status verified: APPROVED');
      break;
    }
    console.log(`\n    [!] Order status on PayPal is currently '${check.status}' (must be 'APPROVED').`);
    console.log('    PayPal has not registered your approval yet.');
    console.log('    Check the following:');
    console.log('      1. Did you open the approval link in a browser?');
    console.log('      2. Did you log in using your SANDBOX Personal (Buyer) account (not Business or live PayPal)?');
    console.log('      3. Did you click the final "Authorize" / "Continue" / "Pay Now" button?');
    console.log('      4. Did the browser redirect to http://localhost:3000/paypal/return?');
    console.log('\n    Once you finish approving, press Enter again to retry.\n');
  }

  step(3, 'Authorizing the order (placing the hold)...');
  const auth = await paypal.authorizeOrder(order.id);
  console.log('    authorization id :', auth.authorizationId);
  console.log('    status           :', auth.status);

  if (doVoid) {
    step(4, 'Voiding the authorization (releasing the hold)...');
    const v = await paypal.voidAuthorization(auth.authorizationId);
    console.log('    status :', v.status);
  } else {
    step(4, 'Capturing the funds...');
    const cap = await paypal.captureAuthorization(auth.authorizationId);
    console.log('    capture id :', cap.captureId);
    console.log('    status     :', cap.status);
  }

  console.log('\nSUCCESS. Now check developer.paypal.com > Testing Tools > Sandbox Accounts > your BUSINESS account > transactions.');
} catch (e) {
  console.error('\nFAILED:', e.message);
  console.error('Copy this whole error and send it to your IDE agent or to me. Do NOT paste your client secret.');
  process.exitCode = 1;
} finally {
  rl.close();
}
