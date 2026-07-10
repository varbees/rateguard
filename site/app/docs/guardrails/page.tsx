import type { Metadata } from "next";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Guardrails",
  description:
    "PII detection, prompt-injection detection, and size limits wired into the middleware — violations return 422 automatically.",
};

export default function GuardrailsPage() {
  return (
    <>
      <DocH1 kicker="Guides">Guardrails</DocH1>
      <P>
        Guardrails check request content <em>before</em> it reaches your handlers or your LLM:
        PII detection, prompt-injection detection, and token/length limits. Violations are
        rejected with HTTP 422.
      </P>

      <DocH2 id="presets">Standard and strict chains</DocH2>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `// Standard: PII + injection + 100KB limit
chain := rateguard.StandardGuardrails()

// Strict: PII + injection + 32K token limit + 50KB limit
chain = rateguard.StrictGuardrails()`,
          },
          {
            label: "Node.js",
            code: `// Standard: PII + injection + 100KB limit
let chain = standardGuardrails();

// Strict: PII + injection + 32K token limit + 50KB limit
chain = strictGuardrails();`,
          },
          {
            label: "Python",
            code: `# Standard: PII + injection + 100KB limit
chain = standard_guardrails()

# Strict: PII + injection + 32K token limit + 50KB limit
chain = strict_guardrails()`,
          },
        ]}
      />

      <DocH2 id="middleware">Wire into the middleware</DocH2>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rg := rateguard.New(rateguard.Config{
    Preset:     "standard",
    Guardrails: rateguard.StandardGuardrails(), // violations → 422
})`,
          },
          {
            label: "Node.js",
            code: `const rg = new RateGuard({
  preset: 'standard',
  guardrails: standardGuardrails(), // violations → 422
});`,
          },
          {
            label: "Python",
            code: `rg = RateGuard(
    preset="standard",
    guardrails=standard_guardrails(), # violations → 422
)`,
          },
        ]}
      />

      <DocH2 id="custom">Custom guardrails</DocH2>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `myGuardrail := MyCustomGuardrail{}

chain := rateguard.NewGuardrailChain(
    rateguard.NewPIIGuardrail(),
    rateguard.NewPromptInjectionGuardrail(),
    myGuardrail,
)

if v := chain.Check(prompt); v != nil {
    rateguard.WriteGuardrailReject(w, v) // HTTP 422
}`,
          },
          {
            label: "Node.js",
            code: `const myGuardrail = new MyCustomGuardrail();

const chain = new GuardrailChain([
  new PIIGuardrail(),
  new PromptInjectionGuardrail(),
  myGuardrail,
]);

const v = chain.check(prompt);
if (v) {
  writeGuardrailReject(res, v); // HTTP 422
}`,
          },
          {
            label: "Python",
            code: `my_guardrail = MyCustomGuardrail()

chain = GuardrailChain([
    PIIGuardrail(),
    PromptInjectionGuardrail(),
    my_guardrail,
])

if v := chain.check(prompt):
    return JSONResponse(status_code=422, content={"error": v.message})`,
          },
        ]}
      />
      <Callout kind="note">
        Guardrails are a defense-in-depth layer, not a substitute for provider-side safety
        systems. They catch the obvious cases (a PAN number in a prompt, a &quot;ignore previous
        instructions&quot; injection) at zero added latency, inside your process.
      </Callout>
      <DocsPager slug="guardrails" />
    </>
  );
}
