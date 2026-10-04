// 조건에 맞는 매물들끼리, 사용자가 고른 가중치(보증금/월세/확률)로 순위를 매기는 함수.
// 보증금·월세는 "낮을수록 좋음", 확률은 "높을수록 좋음"으로 보고 0~1로 정규화한 뒤
// 가중합을 낸다. PRD 규칙대로, 조건(가중치)을 하나도 안 걸었으면(합계 0이면)
// 보증금·월세·확률 동일 가중치로 계산한다.
// (PLAN.md 13번 작업, DESIGN.md 2.2 "기본은 동일 가중치로 정렬")

export type ScorableListing = {
  보증금평균: number | null;
  월세평균: number | null;
  확률: number; // 0~100
};

export type ScoreWeights = { 보증금: number; 월세: number; 확률: number };

/** value를 [min, max] 범위에서 0~1로 뒤집어 정규화한다 (낮을수록 1에 가까움). */
function normalizeLowerIsBetter(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return (max - value) / (max - min);
}

/** 매물 목록에 점수를 매겨 점수 내림차순으로 정렬한 배열을 반환한다. */
export function rankListings<T extends ScorableListing>(
  listings: T[],
  weights: ScoreWeights,
): (T & { 점수: number })[] {
  const weightSum = weights.보증금 + weights.월세 + weights.확률;
  // 가중치를 전부 0으로 두면(=조건 없음) PRD 규칙대로 동일 가중치를 쓴다
  const effectiveWeights =
    weightSum > 0 ? weights : { 보증금: 1, 월세: 1, 확률: 1 };
  const effectiveSum =
    effectiveWeights.보증금 + effectiveWeights.월세 + effectiveWeights.확률;

  const deposits = listings.map((l) => l.보증금평균).filter((v): v is number => v != null);
  const rents = listings.map((l) => l.월세평균).filter((v): v is number => v != null);
  const depositRange = { min: Math.min(...deposits, 0), max: Math.max(...deposits, 0) };
  const rentRange = { min: Math.min(...rents, 0), max: Math.max(...rents, 0) };

  return listings
    .map((listing) => {
      const depositScore =
        listing.보증금평균 != null
          ? normalizeLowerIsBetter(listing.보증금평균, depositRange.min, depositRange.max)
          : 0.5; // 정보 없으면 중간값 취급
      const rentScore =
        listing.월세평균 != null
          ? normalizeLowerIsBetter(listing.월세평균, rentRange.min, rentRange.max)
          : 0.5;
      const probabilityScore = listing.확률 / 100;

      const 점수 =
        (effectiveWeights.보증금 * depositScore +
          effectiveWeights.월세 * rentScore +
          effectiveWeights.확률 * probabilityScore) /
        effectiveSum;

      return { ...listing, 점수 };
    })
    .sort((a, b) => b.점수 - a.점수);
}
