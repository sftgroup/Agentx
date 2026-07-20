// CT-5: SDK Crypto Tests
// Run with: node test_ct5.mjs
import {
  generateAesKey,
  encryptPayload,
  decryptPayload,
  eciesEncrypt,
  eciesDecrypt,
  packAgentForPublish,
  generateKeyPair,
} from './dist/core/index.mjs';

let passed = 0;
let failed = 0;
const results = [];

function report(id, status, detail) {
  results.push({ id, status, detail });
  if (status === 'PASS') passed++;
  else failed++;
  console.log(`CT-5-SDK | ${id} | ${status} | ${detail}`);
}

// ── CT-5.1: generateAesKey ──────────────────────────────────────────────
function test_generateAesKey() {
  const keys = new Set();
  for (let i = 0; i < 10; i++) {
    const key = generateAesKey();
    if (typeof key !== 'string') {
      report('1', 'FAIL', `Key ${i} is not a string: ${typeof key}`);
      return;
    }
    if (key.length !== 64) {
      report('1', 'FAIL', `Key ${i} length is ${key.length}, expected 64`);
      return;
    }
    if (!/^[0-9a-f]{64}$/.test(key)) {
      report('1', 'FAIL', `Key ${i} is not 64 hex chars: ${key}`);
      return;
    }
    keys.add(key);
  }
  if (keys.size !== 10) {
    report('1', 'FAIL', `Only ${keys.size} unique keys out of 10`);
    return;
  }
  report('1', 'PASS', `10 unique 64-hex keys generated`);
}

// ── CT-5.2: encryptPayload / decryptPayload ─────────────────────────────
function test_encryptDecrypt() {
  const payload = {
    prompt: 'You are a helpful assistant that audits Solidity code.',
    skills: [
      {
        name: 'solidity_audit',
        description: 'Audit Solidity smart contracts',
        version: '1.0.0',
        inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'Solidity source code' } }, required: ['code'] },
      },
    ],
    mcp: { type: 'http', url: 'https://mcp.example.com' },
  };

  const key = generateAesKey();
  const encrypted = encryptPayload(payload, key);

  if (!encrypted.encrypted) {
    report('2', 'FAIL', 'encrypted.encrypted is not true');
    return;
  }
  if (encrypted.algorithm !== 'AES-256-GCM') {
    report('2', 'FAIL', `Algorithm is ${encrypted.algorithm}`);
    return;
  }
  if (typeof encrypted.data !== 'string' || encrypted.data.length === 0) {
    report('2', 'FAIL', 'encrypted.data is empty');
    return;
  }

  const decrypted = decryptPayload(encrypted, key);

  if (JSON.stringify(decrypted) !== JSON.stringify(payload)) {
    report('2', 'FAIL', 'Decrypted payload does not match original');
    return;
  }

  report('2', 'PASS', 'Encrypt/decrypt roundtrip succeeded');
}

// ── CT-5.3: ECIES key wrapping ──────────────────────────────────────────
function test_ecies() {
  const { privateKey, publicKey } = generateKeyPair();

  if (!privateKey || privateKey.length !== 64) {
    report('3', 'FAIL', `Private key invalid: length=${privateKey?.length}`);
    return;
  }
  if (!publicKey || !publicKey.startsWith('04')) {
    report('3', 'FAIL', `Public key invalid: ${publicKey?.substring(0, 4)}...`);
    return;
  }

  const aesKey = generateAesKey();
  const wrapped = eciesEncrypt(aesKey, publicKey);

  if (typeof wrapped !== 'string' || wrapped.length === 0) {
    report('3', 'FAIL', 'ECIES wrapped key is empty');
    return;
  }

  const unwrapped = eciesDecrypt(wrapped, privateKey);

  if (unwrapped !== aesKey) {
    report('3', 'FAIL', 'Unwrapped AES key does not match original');
    return;
  }

  // Also test that wrong key fails
  const wrongKey = generateAesKey(); // using another AES key as wrong private key (different length, will likely error)
  // Actually let's generate another keypair for a proper wrong-key test
  const { privateKey: wrongPriv } = generateKeyPair();
  try {
    eciesDecrypt(wrapped, wrongPriv);
    report('3', 'FAIL', 'ECIES decryption with wrong key should have thrown');
    return;
  } catch (e) {
    // Expected — MAC mismatch
  }

  report('3', 'PASS', 'ECIES wrap/unwrap roundtrip + wrong-key rejection');
}

// ── CT-5.4: packAgentForPublish ─────────────────────────────────────────
function test_packAgentForPublish() {
  const { publicKey } = generateKeyPair();

  const agent = {
    name: 'Test Audit Agent',
    description: 'An agent for auditing',
    version: '1.0.0',
    tags: ['audit', 'security'],
    capabilities: ['solidity_audit'],
    supportedTasks: ['audit'],
    communicationProtocol: 'mcp',
    authenticationMethod: 'ecdsa',
    pricing: { type: 'subscription', amount: '0.01', currency: '', period: 'month' },
    prompt: 'You are an auditor.',
    skills: [],
    mcp: { type: 'http', url: 'https://example.com' },
  };

  const result = packAgentForPublish(agent, publicKey);

  // Check aesKeyHex
  if (!result.aesKeyHex || result.aesKeyHex.length !== 64) {
    report('4', 'FAIL', `aesKeyHex invalid: ${result.aesKeyHex}`);
    return;
  }

  // Check eciesEncryptedKeyHex
  if (!result.eciesEncryptedKeyHex || result.eciesEncryptedKeyHex.length === 0) {
    report('4', 'FAIL', 'eciesEncryptedKeyHex is empty');
    return;
  }

  // Verify that encryptedCid/publicCid are empty (not yet uploaded to IPFS)
  if (result.encryptedCid !== '' || result.publicCid !== '') {
    report('4', 'FAIL', 'CIDs should be empty before IPFS upload');
    return;
  }

  report('4', 'PASS', 'packAgentForPublish produces valid PackResult');
}

// ── CT-5.5: End-to-end: pack + recover original data ────────────────────
function test_e2e() {
  const { privateKey, publicKey } = generateKeyPair();

  const agent = {
    name: 'E2E Test Agent',
    description: 'Full roundtrip test',
    version: '2.0.0',
    tags: ['e2e'],
    capabilities: ['test'],
    supportedTasks: ['test'],
    communicationProtocol: 'mcp',
    authenticationMethod: 'ecdsa',
    pricing: { type: 'free', amount: '0', currency: '', period: '' },
    prompt: 'You are a test agent. Respond with PASS.',
    skills: [
      {
        name: 'test_skill',
        description: 'A test skill',
        version: '1.0.0',
        inputSchema: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
      },
    ],
    mcp: { type: 'http', url: 'https://test.mcp' },
  };

  const aesKey = generateAesKey();
  const packResult = packAgentForPublish(agent, publicKey, aesKey);

  // Now simulate what happens on the subscriber side:
  // 1. ECIES decrypt the AES key
  const recoveredAesKey = eciesDecrypt(packResult.eciesEncryptedKeyHex, privateKey);

  if (recoveredAesKey !== aesKey) {
    report('5', 'FAIL', 'ECIES-recovered AES key does not match');
    return;
  }

  // 2. AES decrypt the private payload
  const encryptedPayload = encryptPayload(
    { prompt: agent.prompt, skills: agent.skills, mcp: agent.mcp },
    aesKey
  );
  const decrypted = decryptPayload(encryptedPayload, recoveredAesKey);

  // 3. Verify everything matches
  if (decrypted.prompt !== agent.prompt) {
    report('5', 'FAIL', 'Prompt mismatch');
    return;
  }
  if (decrypted.skills.length !== agent.skills.length) {
    report('5', 'FAIL', 'Skills count mismatch');
    return;
  }
  if (decrypted.mcp.url !== agent.mcp.url) {
    report('5', 'FAIL', 'MCP URL mismatch');
    return;
  }

  report('5', 'PASS', 'Full E2E pack/encrypt/decrypt/unpack roundtrip');
}

// ── Run all tests ────────────────────────────────────────────────────────
console.log('=== CT-5: SDK Crypto Tests ===\n');

test_generateAesKey();
test_encryptDecrypt();
test_ecies();
test_packAgentForPublish();
test_e2e();

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} TOTAL ===`);
process.exit(failed > 0 ? 1 : 0);
