'use strict';
/**
 * Applies the patch suggested by the n8n team (community thread on S3 DeleteObjects + Content-MD5) to the
 * compiled n8n object store, until a fix is released upstream. Run by the root Dockerfile at image build time.
 *
 * Why: the OCIO object store rejects the bulk DeleteObjects request unless it carries Content-MD5,
 * but the AWS SDK sends a CRC32 checksum instead. Without this, n8n cannot delete execution data from S3
 * Verified against the real bucket: stock image fails, patched passes.
 * Remove this patch and its Dockerfile step once n8n ships the fix.
 *
 * The upstream diff is against TypeScript source; n8n ships compiled JavaScript, so this script performs the same
 * change on `object-store.service.ee.js`: for DeleteObjects, drop the SDK's CRC32 checksum headers and send
 * Content-MD5 of the request body instead.
 *
 * It fails loudly (non-zero exit) if the expected line is not found exactly once, so a build never silently
 * ships an unpatched or half-patched file after an n8n upgrade.
 *
 * Usage: node s3-delete-objects-content-md5.cjs
 *
 * It takes no arguments and only ever touches the one fixed file below, so nothing outside the image's n8n
 * installation can be read or written through it.
 */
const fs = require('node:fs');

const target =
  '/usr/local/lib/node_modules/n8n/node_modules/@n8n/blob-storage/dist/object-store/object-store.service.ee.js';

const MARKER = 'addMD5ChecksumForDeleteObjects';
const ORIGINAL = 'const { Errors: errors } = await this.s3Client.send(new client_s3_1.DeleteObjectsCommand(params));';

const REPLACEMENT = `const command = new client_s3_1.DeleteObjectsCommand(params);
                command.middlewareStack.addRelativeTo((next) => async (args) => {
                    const request = args.request;
                    for (const header of Object.keys(request.headers)) {
                        const name = header.toLowerCase();
                        if (name.startsWith('x-amz-checksum-') || name.startsWith('x-amz-sdk-checksum-')) {
                            delete request.headers[header];
                        }
                    }
                    if (typeof request.body !== 'string' && !(request.body instanceof Uint8Array)) {
                        throw new Error('DeleteObjects request body is not a string or bytes; cannot calculate Content-MD5');
                    }
                    request.headers['Content-MD5'] = (0, node_crypto_1.createHash)('md5')
                        .update(request.body)
                        .digest('base64');
                    return await next(args);
                }, {
                    relation: 'after',
                    toMiddleware: 'flexibleChecksumsMiddleware',
                    name: '${MARKER}',
                });
                const { Errors: errors } = await this.s3Client.send(command);`;

const source = fs.readFileSync(target, 'utf8');

if (source.includes(MARKER)) {
  console.log(`Already patched, nothing to do: ${target}`);
  process.exit(0);
}

const occurrences = source.split(ORIGINAL).length - 1;
if (occurrences !== 1) {
  console.error(`Expected the DeleteObjects call exactly once in ${target} but found ${occurrences}. n8n changed; review the patch.`);
  process.exit(1);
}
// The patch calls createHash through the compiled file's own `node_crypto_1` variable, so check that it is declared
// and is the crypto module (any import wrapper such as __importStar is accepted).
// Plain string checks on each line instead of a regular expression, so there is no backtracking to worry about.
const cryptoDeclaration = source
  .split('\n')
  .map((line) => line.trimStart())
  .find((line) => ['const', 'let', 'var'].some((keyword) => line.startsWith(`${keyword} node_crypto_1 =`)));
// Only the right-hand side counts: the variable name itself already contains "crypto".
if (!cryptoDeclaration?.slice(cryptoDeclaration.indexOf('=') + 1).includes('crypto')) {
  console.error(`'node_crypto_1' is not declared as the crypto module in ${target}; the patch cannot calculate Content-MD5.`);
  process.exit(1);
}

fs.writeFileSync(target, source.replace(ORIGINAL, () => REPLACEMENT));
console.log(`Patched ${target}`);
