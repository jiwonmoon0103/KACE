// cox_model.json(파이썬에서 미리 계산해둔 Cox 모형 결과)으로
// 임의의 기간(개월)에 대한 계약 확률을 계산하는 함수.
// Python scripts/cox_model.py의 probability_of_contract 함수와 같은 공식이다.
// (PLAN.md 10번 작업이 사용하는 공통 유틸)

export type BaselineSurvivalPoint = { 개월: number; S0: number };

export type CoxModel = {
  기준_주택유형: string;
  공변량_평균: Record<string, number>;
  계수: Record<string, number>;
  기준_생존곡선: BaselineSurvivalPoint[];
};

/** 계단 함수인 기준 생존곡선에서, 주어진 개월 수 지점의 S0 값을 찾는다. */
export function baselineSurvivalAt(
  curve: BaselineSurvivalPoint[],
  months: number,
): number {
  let s0 = 1;
  for (const point of curve) {
    if (point.개월 <= months) {
      s0 = point.S0;
    } else {
      break;
    }
  }
  return s0;
}

/** 주어진 매물 특성(covariates)이 months개월 안에 계약될 확률(0~1)을 계산한다. */
export function probabilityOfContract(
  cox: CoxModel,
  covariates: Record<string, number>,
  months: number,
): number {
  const hazardRatioLog = Object.entries(cox.계수).reduce(
    (sum, [name, beta]) => sum + beta * (covariates[name] - cox.공변량_평균[name]),
    0,
  );
  const hazardRatio = Math.exp(hazardRatioLog);
  const s0 = baselineSurvivalAt(cox.기준_생존곡선, months);
  return 1 - Math.pow(s0, hazardRatio);
}

/** district_average.json의 확률곡선(이미 '확률'로 변환됨)에서 months 지점 값을 찾는다. */
export function districtAverageProbabilityAt(
  curve: { 개월: number; 확률: number }[],
  months: number,
): number {
  let prob = 0;
  for (const point of curve) {
    if (point.개월 <= months) {
      prob = point.확률;
    } else {
      break;
    }
  }
  return prob;
}
