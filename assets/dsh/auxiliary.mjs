/** Native, memory-only image admission for auxiliary LLM calls. No session or disk store. */
export async function createAuxiliaryRuntime(ctx, load, route) {
  const { DeepSeekAdapter, DeepSeekFileStore } = await load('@deepseek-ai/dsh-llm-deepseek');
  const { prepareImageFile, requestImageVariantId } = await load('@deepseek-ai/dsh-attachment-local');
  // The native adapter's constructor is the dependency-injection boundary.
  // Borrow its credential/model resolvers without mutating the installed adapter.
  const installed = ctx.llm.registration?.(route.provider)?.adapter;
  if (!(installed instanceof DeepSeekAdapter) || !installed.dependencies) {
    return { supportsImages: false, stream: (request) => ctx.llm.stream(request), clear() {} };
  }
  const images = new Map();
  const limits = ctx.attachments.imageLimits;
  const policy = { maxPixels: 4194304, maxDimension: 8192, maxBytes: 4194304 };
  const store = {
    imageLimits: limits,
    async saveImages(inputs) {
      if (inputs.length > limits.maxImagesPerMessage
        || inputs.reduce((sum, image) => sum + image.data.byteLength, 0) > limits.maxMessageImageBytes)
        throw new Error('Auxiliary image batch exceeds native limits');
      const prepared = await Promise.all(inputs.map((input) => prepareImageFile(input, limits, policy)));
      for (const image of prepared) images.set(image.ref.attachmentId, image);
      return prepared.map((image) => image.ref);
    },
    async readImageRequest(ref, target, signal) {
      signal?.throwIfAborted();
      const source = images.get(ref.attachmentId);
      if (!source) throw new Error('Auxiliary image is no longer available');
      const projected = await prepareImageFile({ data: source.data, mediaType: source.ref.mediaType }, limits,
        { maxPixels: target.width * target.height, maxDimension: Math.max(target.width, target.height), maxBytes: target.maxBytes });
      signal?.throwIfAborted();
      return { variantId: requestImageVariantId(ref, target), attachment: ref, data: projected.data,
        mediaType: projected.ref.mediaType, bytes: projected.data.byteLength, width: projected.ref.width,
        height: projected.ref.height, depth: 'uchar', space: 'srgb', hasAlpha: projected.ref.mediaType === 'image/png' };
    },
    imageHostPath() { return undefined; },
  };
  const adapter = new DeepSeekAdapter({ ...installed.dependencies,
    resolveAttachments: () => store, resolveImageAccess: () => undefined,
    resolveFiles: () => new DeepSeekFileStore(),
  });
  return {
    supportsImages: true, store,
    async *stream(request) {
      const call = await adapter.prepareCall(request.provider, request.model, request.signal);
      yield* call.stream(request);
    },
    clear() { images.clear(); },
  };
}
