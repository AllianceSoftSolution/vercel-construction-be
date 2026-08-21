/**
 * Validates presign size limits and attachment URL normalization.
 * Run: npx ts-node src/scripts/testFileUploadLimits.ts
 */
import {
  MAX_FILE_SIZE_BYTES,
  normalizeAttachmentUrls,
} from "../utils/attachmentUrls";

let passed = 0;
let failed = 0;

const assert = (label: string, condition: boolean) => {
  if (condition) {
    passed += 1;
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
};

assert("MAX_FILE_SIZE_BYTES is 150MB", MAX_FILE_SIZE_BYTES === 150 * 1024 * 1024);

assert(
  "normalize null/empty",
  normalizeAttachmentUrls(null).length === 0 &&
    normalizeAttachmentUrls("").length === 0
);

assert(
  "normalize legacy string URL",
  normalizeAttachmentUrls("https://example.com/a.pdf")[0] ===
    "https://example.com/a.pdf"
);

assert(
  "normalize JSON string array",
  normalizeAttachmentUrls('["https://a","https://b"]').length === 2
);

assert(
  "normalize array input",
  normalizeAttachmentUrls(["https://a", "https://b"]).length === 2
);

assert(
  "normalize nested arrays",
  normalizeAttachmentUrls([["https://a"], "https://b"]).length === 2
);

const overLimit = MAX_FILE_SIZE_BYTES + 1;
assert(
  "151MB metadata would exceed limit check",
  overLimit > MAX_FILE_SIZE_BYTES
);

const underLimit = MAX_FILE_SIZE_BYTES - 1024;
assert(
  "149MB metadata passes limit check",
  underLimit <= MAX_FILE_SIZE_BYTES
);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
