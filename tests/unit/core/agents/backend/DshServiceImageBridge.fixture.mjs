// Plain-node fixture: exercises the exported history image-block resolver from
// the bundled DSH service without loading any installed Harness package. The
// synthetic store stands in for `ctx.attachments` and covers owned content,
// display-name metadata and the missing/corrupt/opaque failure containment.
import { resolveImageBlock } from '../../../../../assets/dsh/service.mjs';

const store = {
  async readImage(ref) {
    if (ref.attachmentId === 'missing') { const e = new Error('not found'); e.code = 'ATTACHMENT_NOT_FOUND'; throw e; }
    if (ref.attachmentId === 'corrupt') { const e = new Error('digest mismatch'); e.code = 'ATTACHMENT_CORRUPT'; throw e; }
    if (ref.attachmentId === 'opaque') { const e = new Error('disk failure'); throw e; }
    const data = Uint8Array.from([1, 2, 3]);
    return ref.attachmentId === 'named'
      ? { ref: { mediaType: 'image/png', name: 'shot.png' }, data }
      : { ref: { mediaType: 'image/jpeg' }, data };
  },
};

const results = {
  passthrough: await resolveImageBlock(store, { type: 'text', text: 'hello' }),
  ownedNamed: await resolveImageBlock(store, { type: 'image', attachment: { attachmentId: 'named', mediaType: 'image/png' } }),
  ownedUnnamed: await resolveImageBlock(store, { type: 'image', attachment: { attachmentId: 'plain', mediaType: 'image/jpeg' } }),
  missing: await resolveImageBlock(store, { type: 'image', attachment: { attachmentId: 'missing', mediaType: 'image/png' } }),
  corrupt: await resolveImageBlock(store, { type: 'image', attachment: { attachmentId: 'corrupt', mediaType: 'image/png' } }),
  opaqueFailure: await resolveImageBlock(store, { type: 'image', attachment: { attachmentId: 'opaque', mediaType: 'image/png' } }),
};
console.log(`RESULT:${JSON.stringify(results)}`);
