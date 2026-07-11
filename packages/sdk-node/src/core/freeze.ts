/**
 * Runtime kill switch. Freezing a scope makes every matching outbound LLM call
 * halt immediately with a synthesized 403, until it is unfrozen. Trip it from
 * code (RateGuard.freeze) or from ops tooling (POST /admin/freeze) and every
 * affected agent stops spending at once, no redeploy.
 *
 * The empty string freezes everything; a customer id freezes just that customer
 * (matched against the X-RateGuard-Customer header). Mirrors Go's
 * FreezeController; this is the EU AI Act Article 14 interrupt hook, in-process.
 */
export class FreezeController {
  private global = false;
  private readonly customers = new Set<string>();

  /** Halt outbound calls for a scope. Empty scope freezes everything. */
  freeze(scope: string): void {
    if (scope === '') {
      this.global = true;
      return;
    }
    this.customers.add(scope);
  }

  /** Lift a freeze. Empty scope lifts the global freeze only. */
  unfreeze(scope: string): void {
    if (scope === '') {
      this.global = false;
      return;
    }
    this.customers.delete(scope);
  }

  /** Whether a call attributed to `customer` must be halted. */
  halts(customer: string | undefined): boolean {
    return this.global || (!!customer && this.customers.has(customer));
  }

  /** Whether a scope is currently frozen. Empty scope reports the global freeze only. */
  isFrozen(scope: string): boolean {
    if (scope === '') return this.global;
    return this.global || this.customers.has(scope);
  }

  /** Active freezes: "*" for a global freeze, "customer=<id>" per frozen customer. */
  frozenScopes(): string[] {
    const out: string[] = [];
    if (this.global) out.push('*');
    for (const c of this.customers) out.push(`customer=${c}`);
    return out;
  }
}
