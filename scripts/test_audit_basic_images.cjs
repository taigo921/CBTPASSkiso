const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const expected = {
  'A3-003': ['1-60.json', 'A', '3dd28277daab91056afb0a4b0c0594dcf5e76994718ab61b9e19029b162ebabb'],
  'B1-006': ['1-60.json', 'E', '9f4159fe7da928890c3c18b9faacc04369fbd5f1fe76873f3361bf986a9d57cf'],
  'B3-001': ['91-120.json', 'C', '2564b1eb7895fc2c0d7df8ba211d3ac4c58986435e866dba5fc0bcc382181d59'],
  'B3-009': ['91-120.json', 'D', '9ca1a28093f4b263a045e6033ecd66ba41f6248984ba9afbab10b461673d0f6a'],
  'B4-025': ['121-144.json', 'C', '623146de9f177417f88ae5188ee0b0c5fdb1e4d964ffd53be29fd12a25a8d1f6'],
  'B4-036': ['121-144.json', 'C', '0d135e302872e2672b4e4b8a3357d62c6df0d15eca031ca59a5b6d813f8ecd66'],
  'C2-029': ['145-174.json', 'E', '0fe0d5d6082b9d1d95461871d4a814da95277300d4a093c7371462e3a65fabd0'],
  'C3-001': ['175-204.json', 'C', '6f703767944b794de847937329dd80977d15d719a4efd43293e7faa3b15a96ca'],
  'C3-034': ['C3-034-118.json', 'A', '14fbfdba0a217855ba67a9232005ac777fb3ac74fb3c8344c10966b9ffb31914'],
  'C3-049': ['C3-034-118.json', 'E', 'ad2f550e79784c50d9ca4c77f63a5b74b14c12ce0463fb32b11ebf010d15cddb'],
  'C3-054': ['C3-034-118.json', 'B', '5303a50f63c9188739269aaaebd57feabb0d8dd0ea209a5b16a8becd9dba84f0'],
  'C3-055': ['C3-034-118.json', 'C', '942611e11822883209c4eceea0119877c79f9ac9778358d44f5393c2c62d138d'],
  'C3-073': ['C3-034-118.json', 'E', '8d2c26271c67f58d9dc7fbd9c47e892c1f43d0c8fca6b816d2578910813c9ee3'],
  'C3-086': ['C3-034-118.json', 'D', 'ceb56fc8e21f27b55c88e3e20cad8ef103458b1df25a5308c3d40cb40ad08932'],
  'C3-199': ['C3-119-204.json', 'C', '573f526ead1afdda35de27015ea66eac9ff529ff40a1c9837e3ea75e72f8a598'],
  'C3-200': ['C3-119-204.json', 'B', '24126cb99eff2ad16ce07288748d7d81d26a5a39e6df2c6b1f07b72afe987272'],
  'C3-202': ['C3-119-204.json', 'E', 'af59669d5a33a0df080afd8197560bc7a67995888dbf303a770ef52d659e0ae2'],
  'C3-204': ['C3-119-204.json', 'B', '8c49d4e2012db909dc03bdec246f855cc61a5f09870b523cf11ba92c5f5d7c49'],
  'C4-076': ['C4-001-094.json', 'D', 'a08f6c2bc3d0c2b1941fdcb318e1889b94655cff55b078b398c91b0954fe3bfa'],
  'C5-016': ['C5-001-055.json', 'E', 'ae237c835bb9d62837994530bd3f5fc713aa3300cfbf3d703358ac874e8b1746'],
  'C5-031': ['C5-001-055.json', 'B', '73fcc9ddd439a8a2803ffa2167ffb9dae473e214294064b23b07ae45bf5e3b7d'],
  'D1-007': ['D1-001-034.json', 'A', '0b8920d9f98bdde0a595b12e28b757379eb3b37d9373cdf024e8df0eddec2874'],
  'D2-008': ['D2-001-076.json', 'D', 'edafccd519ad66a8801df4e5fc5302d61a8c4e89302fda1d53e3c99f801241ea'],
  'D2-029': ['D2-001-076.json', 'D', '6481a4c980c30a2e6a792aa991d3165e600410fd3004673dab09c84281820629'],
};

const questionsByFile = new Map();
const load = file => {
  if (!questionsByFile.has(file)) {
    const source = path.join(__dirname, '..', 'data', file);
    questionsByFile.set(file, JSON.parse(fs.readFileSync(source, 'utf8')));
  }
  return questionsByFile.get(file);
};
const imageBytes = question => Buffer.from(
  String(question.image_base64).replace(/^data:[^;]+;base64,/, ''),
  'base64',
);
const sha = question => crypto.createHash('sha256').update(imageBytes(question)).digest('hex');

for (const [uid, [file, answer, expectedSha]] of Object.entries(expected)) {
  const question = load(file).find(item => item.uid === uid);
  assert.ok(question, `${uid} exists in ${file}`);
  assert.match(question.image_base64, /^data:image\/webp;base64,/, `${uid} uses a WebP data URI`);
  assert.equal(sha(question), expectedSha, `${uid} keeps its reviewed audit crop`);
  assert.equal(question.answer, answer, `${uid} keeps answer ${answer}`);
  assert.ok(imageBytes(question).length <= 300 * 1024, `${uid} remains at or below 300 KiB`);
}

console.log(`PASS audit basic images: ${Object.keys(expected).length} reviewed crops and answers are pinned`);
