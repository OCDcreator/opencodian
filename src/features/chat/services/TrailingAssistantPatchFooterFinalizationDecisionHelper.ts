export type TrailingAssistantPatchFooterFinalizationDecisionSource = {
  previousBodySignature: string;
  nextBodySignature: string;
};

export function shouldFinalizeTrailingAssistantFooterOnly(
  source: TrailingAssistantPatchFooterFinalizationDecisionSource,
): boolean {
  return source.previousBodySignature === source.nextBodySignature;
}
