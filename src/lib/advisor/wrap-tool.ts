// Phase 6: tenant injection wrapper for advisor tools.
//
// Every tool's "real" implementation accepts (args, ctx) where ctx contains
// householdId + userId pulled from the authenticated session. The LLM never
// touches these — even if it tries to set them in tool args, we strip and
// override.
//
// This is the security boundary. Without it, a sufficiently sneaky prompt
// injection could try `getCashFlowSummary({householdId: "<other-uuid>"})`
// and read someone else's data.

export type AdvisorContext = {
  householdId: string;
  userId: string;
};

export function withTenantContext<
  TArgs extends Record<string, unknown>,
  TResult,
>(
  fn: (args: TArgs, ctx: AdvisorContext) => Promise<TResult>,
  ctx: AdvisorContext,
) {
  return async (
    args: TArgs & { householdId?: string; userId?: string },
  ): Promise<TResult> => {
    if (
      'householdId' in args &&
      args.householdId &&
      args.householdId !== ctx.householdId
    ) {
      console.warn('[ADVISOR-SECURITY] LLM attempted tenant crossing', {
        ctx,
        attempted: args.householdId,
      });
    }
    if ('userId' in args && args.userId && args.userId !== ctx.userId) {
      console.warn('[ADVISOR-SECURITY] LLM attempted user crossing', {
        ctx,
        attempted: args.userId,
      });
    }
    // Strip and re-inject from session
    const cleaned: Record<string, unknown> = { ...args };
    delete cleaned.householdId;
    delete cleaned.userId;
    return fn(cleaned as TArgs, ctx);
  };
}
