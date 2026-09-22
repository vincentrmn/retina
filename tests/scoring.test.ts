import { describe, expect, it } from "vitest";
import { scoreCandidat } from "../src/lib/scoring";
import { DEFAULT_CRITERES, normalizeCriteres } from "../src/lib/types";
import { salarie } from "./fixtures";

const now = new Date("2026-09-22");
const bien = (criteres: object = {}) => ({ loyer: 1000, charges: 200, criteres: { ...DEFAULT_CRITERES, ...criteres } });

describe("normalizeCriteres : compatibilité des anciens biens", () => {
  it("un ancien `cdiRequis` devient un critère CDI actif et éliminatoire", () => {
    const n = normalizeCriteres({ cdiRequis: true, ratioMin: 3 });
    expect(n.cdiActif).toBe(true);
    expect(n.cdiEliminatoire).toBe(true);
  });
  it("une ancienneté minimale ancienne active le critère ancienneté", () => {
    expect(normalizeCriteres({ ancienneteMinMois: 12 }).ancienneteActif).toBe(true);
    expect(normalizeCriteres({}).ancienneteActif).toBe(false);
  });
  it("des critères absents retombent sur les valeurs par défaut", () => {
    expect(normalizeCriteres(null)).toEqual(DEFAULT_CRITERES);
  });
});

describe("scoreCandidat", () => {
  it("est déterministe : même dossier, même score", () => {
    const s = [salarie("A", 2500), salarie("B", 1800)];
    expect(scoreCandidat(bien(), s, [], now)).toEqual(scoreCandidat(bien(), s, [], now));
  });

  it("un couple en CDI au-dessus du ratio obtient les 40 points de ratio et le maximum", () => {
    const score = scoreCandidat(bien(), [salarie("A", 2500), salarie("B", 1800)], [], now);
    expect(score.criteres.find((c) => c.key === "ratio")!.points).toBe(40);
    expect(score.total).toBe(100);
    expect(score.eliminatoire).toBe(false);
  });

  it("un critère éliminatoire plafonne le score à 40", () => {
    const score = scoreCandidat(bien({ cdiActif: true, cdiEliminatoire: true }), [salarie("A", 6000, "CDD")], [], now);
    expect(score.eliminatoire).toBe(true);
    expect(score.total).toBeLessThanOrEqual(40);
  });

  it("chaque incohérence non validée retire 5 points ; une incohérence validée à la main ne pénalise plus", () => {
    const s = [salarie("A", 4000)];
    const ko = { personne: "A" as const, check: "nom", ok: false, detail: "" };
    const coh = (c: object) => scoreCandidat(bien(), s, [c as typeof ko], now).criteres.find((x) => x.key === "coherence")!.points;
    expect(coh(ko)).toBe(10);
    expect(coh({ ...ko, ignored: true })).toBe(15);
  });

  it("le revenu d'un indépendant n'est retenu qu'à 80 % pour le ratio", () => {
    const indep = salarie("A", 3000, "independant", 36);
    const score = scoreCandidat(bien(), [indep], [], now);
    expect(score.revenusMenage).toBe(2400);
  });

  it("un critère de ratio désactivé donne les 40 points sans exigence de revenus", () => {
    const score = scoreCandidat(bien({ ratioActif: false }), [salarie("A", 500)], [], now);
    expect(score.criteres.find((c) => c.key === "ratio")!.points).toBe(40);
  });
});
