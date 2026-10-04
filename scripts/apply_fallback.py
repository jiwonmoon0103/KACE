# -*- coding: utf-8 -*-
# 거래 건수가 5건 미만이거나 0건인 주소를 찾아, 그런 주소에는 개별 Cox 예측 대신
# "성북구 전체 평균" 확률/추이를 쓰도록 표시해둔다.
# (PLAN.md 5번 작업, PRD.md 5-1 "거래 건수 부족 시 평균값으로 대체" 규칙)
#
# 성북구 전체 평균 확률은 cox_model.json의 "기준_생존곡선"을 그대로 쓴다.
# Cox 모형은 공변량(전용면적·연식·주택유형)을 평균값으로 맞추면 하나도 안 틀리고
# 그대로 "평균적인 매물"의 생존곡선이 되기 때문에, 따로 계산할 필요가 없다.

import json
import os
from datetime import date, timedelta

MONTHLY_RENT_PATH = os.path.join("data", "processed", "monthly_rent.json")
TREND_BY_BUILDING_PATH = os.path.join("data", "processed", "trend_by_building.json")
COX_MODEL_PATH = os.path.join("data", "processed", "cox_model.json")
RELIABILITY_OUTPUT_PATH = os.path.join("data", "processed", "listing_reliability.json")
DISTRICT_AVERAGE_OUTPUT_PATH = os.path.join("data", "processed", "district_average.json")

MIN_TRANSACTIONS = 5  # 이 건수 미만이면 "데이터 부족"으로 본다


def building_key(record):
    return (record.get("시군구"), record.get("번지"), record.get("건물명"))


def parse_contract_date(record):
    ym, day = record.get("계약년월"), record.get("계약일")
    if not ym or not day:
        return None
    try:
        return date(int(str(ym)[:4]), int(str(ym)[4:6]), int(str(day)))
    except (ValueError, TypeError):
        return None


def compute_district_trend(records):
    """성북구 전체를 하나로 봤을 때의 최근 1년 vs 이전 1년 추이."""
    dates = [d for d in (parse_contract_date(r) for r in records) if d is not None]
    end_of_window = max(dates)
    recent_start = end_of_window - timedelta(days=365)
    previous_start = end_of_window - timedelta(days=730)

    recent = sum(1 for d in dates if recent_start < d <= end_of_window)
    previous = sum(1 for d in dates if previous_start < d <= recent_start)

    if recent > previous:
        trend = "상승"
    elif recent < previous:
        trend = "하락"
    else:
        trend = "보합"

    return {"최근1년_전체건수": recent, "이전1년_전체건수": previous, "추이": trend}


def compute_district_probability_curve(cox_model):
    """Cox 기준 생존곡선(평균적인 매물 기준)을 '계약될 확률' 곡선으로 바꾼다."""
    return [
        {"개월": point["개월"], "확률": round(1 - point["S0"], 4)}
        for point in cox_model["기준_생존곡선"]
    ]


def main():
    with open(MONTHLY_RENT_PATH, encoding="utf-8") as f:
        rent_records = json.load(f)
    with open(TREND_BY_BUILDING_PATH, encoding="utf-8") as f:
        trend_by_building = json.load(f)
    with open(COX_MODEL_PATH, encoding="utf-8") as f:
        cox_model = json.load(f)

    # 건물별 거래 건수 세기
    transaction_counts = {}
    for r in rent_records:
        key = building_key(r)
        transaction_counts[key] = transaction_counts.get(key, 0) + 1

    district_trend = compute_district_trend(rent_records)
    district_probability_curve = compute_district_probability_curve(cox_model)

    district_average = {
        **district_trend,
        "확률곡선": district_probability_curve,
    }

    reliability_rows = []
    for row in trend_by_building:
        key = (row["시군구"], row["번지"], row["건물명"])
        count = transaction_counts.get(key, 0)
        insufficient = count < MIN_TRANSACTIONS

        reliability_rows.append({
            "시군구": row["시군구"],
            "번지": row["번지"],
            "건물명": row["건물명"],
            "거래건수": count,
            "데이터부족여부": insufficient,
            "확률_기준": "성북구평균" if insufficient else "개별",
            # 데이터가 부족하면 그 매물만의 추이 대신 성북구 전체 추이를 보여준다
            "추이": district_trend["추이"] if insufficient else row["추이"],
        })

    with open(RELIABILITY_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(reliability_rows, f, ensure_ascii=False, indent=2)

    with open(DISTRICT_AVERAGE_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(district_average, f, ensure_ascii=False, indent=2)

    insufficient_count = sum(1 for r in reliability_rows if r["데이터부족여부"])
    print(f"전체 건물: {len(reliability_rows)}개")
    print(f"데이터 부족(거래 {MIN_TRANSACTIONS}건 미만) 건물: {insufficient_count}개 "
          f"({insufficient_count / len(reliability_rows) * 100:.1f}%)")
    print(f"성북구 전체 추이: {district_trend['추이']} "
          f"(최근1년 {district_trend['최근1년_전체건수']}건 / "
          f"이전1년 {district_trend['이전1년_전체건수']}건)")
    print(f"저장 위치: {RELIABILITY_OUTPUT_PATH}, {DISTRICT_AVERAGE_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
