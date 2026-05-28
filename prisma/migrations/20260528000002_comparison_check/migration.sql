-- Price-comparison guardrail at the database layer.
--
-- Enforces the kickoff non-negotiable: "Never have the comparison feature
-- invent a price." If a `Comparison` row carries a non-null `comparablePrice`
-- it MUST also carry a `sourceUrl`. The DB itself rejects the alternative.
--
-- Belt-and-braces alongside the app-level validation in
-- lib/gemini/comparison.ts and the required unit test.

ALTER TABLE "Comparison"
  ADD CONSTRAINT "Comparison_price_requires_source"
  CHECK ("comparablePrice" IS NULL OR "sourceUrl" IS NOT NULL);
