# -*- coding: utf-8 -*-
# survival_data.json(건물 단위 생존 시간 데이터)으로 전체 기준 Kaplan-Meier
# 생존곡선을 계산하고, monthly_rent.json으로 건물별 최근 1년 vs 이전 1년
# 계약 건수를 비교해 추이(상승/하락/보합)를 판정한다.
# (PLAN.md 3번 작업, PRD.md 5-1 "분석 방법" / "추이" 규칙)

import json
import os
from datetime import date, timedelta

from lifelines import KaplanMeierFitter

SURVIVAL_PATH = os.path.join("data", "processed", "survival_data.json")
MONTHLY_RENT_PATH = os.path.join("data", "processed", "monthly_rent.json")
KM_OUTPUT_PATH = os.path.join("data", "processed", "kaplan_meier.json")
TREND_OUTPUT_PATH = os.path.join("data", "processed", "trend_by_building.json")


def building_key(record):
    return (record.get("시군구"), record.get("번지"), record.get("건물명"))


def parse_contract_date(record):
    ym = record.get("계약년월")
    day = record.get("계약일")
    if not ym or not day:
        return None
    try:
        return date(int(str(ym)[:4]), int(str(ym)[4:6]), int(str(day)))
    except (ValueError, TypeError):
        return None


def compute_overall_kaplan_meier():
    """전체 매물을 기준으로 한 Kaplan-Meier 생존곡선(= 계약 안 되고 남아있을 확률)을 계산한다."""
    with open(SURVIVAL_PATH, encoding="utf-8") as f:
        survival_rows = json.load(f)

    durations = [r["기간_개월"] for r in survival_rows]
    events = [r["event"] for r in survival_rows]

    kmf = KaplanMeierFitter()
    kmf.fit(durations, event_observed=events)

    # survival_function_ : 시간(개월)별 "아직 계약 안 됨" 확률
    curve = [
        {"개월": round(float(month), 2), "생존확률": round(float(prob), 4)}
        for month, prob in kmf.survival_function_.itertuples()
    ]

    with open(KM_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(curve, f, ensure_ascii=False, indent=2)

    return curve


def compute_trend_by_building():
    """건물별로 최근 1년 vs 이전 1년 계약 건수를 비교해 상승/하락/보합을 판정한다."""
    with open(MONTHLY_RENT_PATH, encoding="utf-8") as f:
        records = json.load(f)

    dated = []
    for r in records:
        d = parse_contract_date(r)
        if d is not None:
            dated.append((building_key(r), d, r))

    end_of_window = max(d for _, d, _ in dated)
    recent_start = end_of_window - timedelta(days=365)
    previous_start = end_of_window - timedelta(days=730)

    buildings = {}
    for key, d, r in dated:
        buildings.setdefault(key, {"info": r, "recent": 0, "previous": 0})
        if recent_start < d <= end_of_window:
            buildings[key]["recent"] += 1
        elif previous_start < d <= recent_start:
            buildings[key]["previous"] += 1

    trend_rows = []
    for (sigungu, bunji, building_name), stat in buildings.items():
        recent, previous = stat["recent"], stat["previous"]
        if recent > previous:
            trend = "상승"
        elif recent < previous:
            trend = "하락"
        else:
            trend = "보합"
        trend_rows.append({
            "시군구": sigungu,
            "번지": bunji,
            "건물명": building_name,
            "주택유형": stat["info"].get("주택유형"),
            "최근1년_계약건수": recent,
            "이전1년_계약건수": previous,
            "추이": trend,
        })

    with open(TREND_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(trend_rows, f, ensure_ascii=False, indent=2)

    return trend_rows


def main():
    curve = compute_overall_kaplan_meier()
    near_one_month = min(curve, key=lambda p: abs(p["개월"] - 1))
    print(f"[Kaplan-Meier] 시점 {len(curve)}개 계산 완료 -> {KM_OUTPUT_PATH}")
    print(f"  예: 1개월 지점 근처 생존확률 = {near_one_month}")

    trend_rows = compute_trend_by_building()
    counts = {"상승": 0, "하락": 0, "보합": 0}
    for r in trend_rows:
        counts[r["추이"]] += 1
    print(f"[추이 판정] 건물 {len(trend_rows)}개 -> {TREND_OUTPUT_PATH}")
    print(f"  상승 {counts['상승']} / 하락 {counts['하락']} / 보합 {counts['보합']}")


if __name__ == "__main__":
    main()
