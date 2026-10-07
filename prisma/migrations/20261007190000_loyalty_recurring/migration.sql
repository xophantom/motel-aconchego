-- Fidelidade recorrente: "a cada N visitas pagas, X% numa estadia" substitui as
-- faixas resgatáveis 1× por cliente. As faixas ficam como legado.

-- Resgate passa a guardar o próprio percentual (copiado da faixa) e não exige faixa.
ALTER TABLE "loyalty_redemption" DROP CONSTRAINT "loyalty_redemption_tier_id_fkey";

ALTER TABLE "loyalty_redemption" ADD COLUMN     "discount_percent" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "tier_id" DROP NOT NULL;

UPDATE "loyalty_redemption" r SET "discount_percent" = t."discount_percent"
FROM "loyalty_tier" t WHERE t."id" = r."tier_id";

-- Regra recorrente (linha única; sem linha = padrão 10 visitas → 100%).
CREATE TABLE "loyalty_policy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "every_visits" INTEGER NOT NULL DEFAULT 10,
    "discount_percent" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "loyalty_policy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loyalty_redemption_stay_id_idx" ON "loyalty_redemption"("stay_id");

ALTER TABLE "loyalty_redemption" ADD CONSTRAINT "loyalty_redemption_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "loyalty_tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
