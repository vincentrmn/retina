import { describe, expect, it } from "vitest";
import { buildSynthese } from "../src/lib/synthese";
import { bulletin, dossier } from "./fixtures";

const now = new Date("2026-09-22");
const salaire = (docs: ReturnType<typeof dossier>[]) => buildSynthese(docs, now)[0]?.emploi?.salaire_net_mensuel;

describe("buildSynthese : salaire salarié = cash récurrent", () => {
  it("sans les nouveaux champs (anciennes extractions), moyenne du net des bulletins", () => {
    const d = dossier([
      bulletin("2026-06", { net: 2200, brut: 3000 }),
      bulletin("2026-07", { net: 2300, brut: 3000 }),
      bulletin("2026-08", { net: 2280, brut: 3000 }),
    ]);
    expect(salaire([d])).toBe(2260);
  });

  it("retient le net à payer, pas la ligne Net gonflée par l'avantage en nature", () => {
    const d = dossier([bulletin("2026-08", { net: 6824, aPayer: 5855, brut: 9945, avantage: 945 })]);
    expect(salaire([d])).toBe(5855);
  });

  it("retire au prorata une avance sur bonus (cas réel de juillet 2026 : +50 % sans correction)", () => {
    // Brut de cash 9 000 dont 2 500 d'avance : part récurrente 6 500 / 9 000.
    const d = dossier([bulletin("2026-08", { aPayer: 5855, brut: 9945, avantage: 945, nonRecur: 2500 })]);
    expect(salaire([d])).toBeCloseTo(5855 * (6500 / 9000), 1);
  });

  it("écarte un bulletin en devise étrangère, sans jamais le convertir", () => {
    const d = dossier([bulletin("2026-07", { net: 2000, brut: 2600 }), bulletin("2026-08", { net: 90000, brut: 110000 }, "MUR")]);
    const p = buildSynthese([d], now)[0];
    expect(p.emploi?.salaire_net_mensuel).toBe(2000);
    expect(p.emploi?.aVerifier.join(" ")).toMatch(/MUR/);
  });
});
