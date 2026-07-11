package rateguard

import "sync"

// FreezeController is the runtime kill switch. Freezing a scope makes every
// matching outbound LLM call halt immediately with a synthesized 403, until the
// scope is unfrozen. It is the operator's stop button: trip it from code
// (SDK.Freeze) or from ops tooling (the admin API's /admin/freeze), and every
// affected agent stops spending at once, without a redeploy.
//
// Two scopes: the empty string freezes everything; a customer id freezes just
// that customer (matched against the X-RateGuard-Customer header). This is the
// interrupt/override capability the EU AI Act Article 14 expects a human to have
// over an autonomous system, implemented in-process.
type FreezeController struct {
	mu        sync.RWMutex
	global    bool
	customers map[string]bool
}

func newFreezeController() *FreezeController {
	return &FreezeController{customers: map[string]bool{}}
}

// Freeze halts outbound calls for a scope. The empty scope ("") freezes every
// call; any other value freezes a single customer.
func (f *FreezeController) Freeze(scope string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if scope == "" {
		f.global = true
		return
	}
	f.customers[scope] = true
}

// Unfreeze lifts a freeze. The empty scope lifts the global freeze; per-customer
// freezes are independent and unaffected by it.
func (f *FreezeController) Unfreeze(scope string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if scope == "" {
		f.global = false
		return
	}
	delete(f.customers, scope)
}

// halts reports whether a call attributed to customer must be stopped: the
// global freeze halts everything, a per-customer freeze halts that customer.
func (f *FreezeController) halts(customer string) bool {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.global || (customer != "" && f.customers[customer])
}

// IsFrozen reports whether a scope is currently frozen. The empty scope reports
// the global freeze only; any other value reports whether that customer is
// frozen, or whether a global freeze is in effect.
func (f *FreezeController) IsFrozen(scope string) bool {
	f.mu.RLock()
	defer f.mu.RUnlock()
	if scope == "" {
		return f.global
	}
	return f.global || f.customers[scope]
}

// FrozenScopes lists the active freezes: "*" for a global freeze, and
// "customer=<id>" for each frozen customer.
func (f *FreezeController) FrozenScopes() []string {
	f.mu.RLock()
	defer f.mu.RUnlock()
	scopes := make([]string, 0, len(f.customers)+1)
	if f.global {
		scopes = append(scopes, "*")
	}
	for c := range f.customers {
		scopes = append(scopes, "customer="+c)
	}
	return scopes
}

// Freeze halts outbound LLM calls for a scope from inside the process. Empty
// scope freezes everything; any other value freezes that customer (the
// X-RateGuard-Customer header). Frozen calls return a synthesized 403.
func (s *SDK) Freeze(scope string) { s.freeze.Freeze(scope) }

// Unfreeze lifts a freeze set by Freeze.
func (s *SDK) Unfreeze(scope string) { s.freeze.Unfreeze(scope) }

// IsFrozen reports whether a scope is currently frozen.
func (s *SDK) IsFrozen(scope string) bool { return s.freeze.IsFrozen(scope) }

// FrozenScopes lists the active freezes.
func (s *SDK) FrozenScopes() []string { return s.freeze.FrozenScopes() }
