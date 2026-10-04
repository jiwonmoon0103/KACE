# -*- coding: utf-8 -*-
# Cox 모형이 실제로 쓸만한지 확인하기 위한 백테스트.
# 전체 기간을 "학습 기간"(옛날 데이터)과 "검증 기간"(최근 1년)으로 나눠서,
# 학습 기간까지의 데이터로만 모형을 새로 학습한 다음, 검증 기간 동안 각 건물에
# 실제로 새 계약이 생겼는지를 예측이 맞혔는지 비교해 일치율을 계산한다.
# (PLAN.md 6번 작업, PRD.md 3번 성공 기준 "백테스트 일치율 80% 이상")

import json
import math
import os
from datetime import date, timedelta

import pandas as pd
from lifelines import CoxPHFitter

MONTHLY_RENT_PATH = os.path.join("data", "processed", "monthly_rent.json")
OUTPUT_PATH = os.path.join("data", "processed", "backtest_result.json")

COVARIATES = ["전용면적", "건물연식", "주택유형_연립", "주택유형_오피스텔"]
PREDICTION_THRESHOLD = 0.5  # 예측 확률이 이 값 이상이면 "계약될 것"으로 판단


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


def build_training_survival_rows(train_records, cutoff):
    """학습 기간 거래만으로, cutoff 시점에서 중도절단되는 생존 데이터를 만든다."""
    by_building = {}
    for r in train_records:
        key = building_key(r)
        by_building.setdefault(key, {"records": [], "dates": []})
        by_building[key]["records"].append(r)
        by_building[key]["dates"].append(r["_date"])

    rows = []
    for key, group in by_building.items():
        dates = sorted(group["dates"])
        areas = [r["전용면적"] for r in group["records"] if r.get("전용면적") is not None]
        years = [r["건축년도"] for r in group["records"] if r.get("건축년도") is not None]
        housing_type = group["records"][0].get("주택유형") or "다세대"

        if not areas or not years:
            continue  # 공변량이 없으면 학습에서 제외

        area_mean = sum(areas) / len(areas)
        building_age = cutoff.year - (sorted(years)[len(years) // 2])

        for prev_date, next_date in zip(dates, dates[1:]):
            duration_days = (next_date - prev_date).days
            if duration_days > 0:
                rows.append({
                    "건물키": key, "기간_개월": duration_days / 30.44, "event": True,
                    "전용면적": area_mean, "건물연식": building_age,
                    "주택유형_연립": int(housing_type == "연립"),
                    "주택유형_오피스텔": int(housing_type == "오피스텔"),
                })

        censored_days = (cutoff - dates[-1]).days
        if censored_days > 0:
            rows.append({
                "건물키": key, "기간_개월": censored_days / 30.44, "event": False,
                "전용면적": area_mean, "건물연식": building_age,
                "주택유형_연립": int(housing_type == "연립"),
                "주택유형_오피스텔": int(housing_type == "오피스텔"),
                # 백테스트 전용: cutoff 시점까지 이미 지나간 기간(검증 확률 계산에 필요)
                "_cutoff_까지_지난_개월": censored_days / 30.44,
            })

    return rows, by_building


def baseline_survival_at(curve, months):
    """계단 함수인 기준 생존곡선에서, 주어진 개월 수 지점의 S0 값을 찾는다."""
    s0 = 1.0
    for point in curve:
        if point["개월"] <= months:
            s0 = point["S0"]
        else:
            break
    return s0


def main():
    with open(MONTHLY_RENT_PATH, encoding="utf-8") as f:
        records = json.load(f)

    for r in records:
        r["_date"] = parse_contract_date(r)
    records = [r for r in records if r["_date"] is not None]

    end_of_window = max(r["_date"] for r in records)
    cutoff = end_of_window - timedelta(days=365)  # 검증 기간 = 최근 1년
    validation_months = (end_of_window - cutoff).days / 30.44

    train_records = [r for r in records if r["_date"] <= cutoff]
    validation_records = [r for r in records if r["_date"] > cutoff]

    print(f"학습 기간: ~{cutoff.isoformat()} ({len(train_records)}건)")
    print(f"검증 기간: {cutoff.isoformat()} ~ {end_of_window.isoformat()} ({len(validation_records)}건)")

    survival_rows, by_building = build_training_survival_rows(train_records, cutoff)
    model_df = pd.DataFrame(survival_rows)

    cph = CoxPHFitter()
    cph.fit(model_df[["기간_개월", "event"] + COVARIATES], duration_col="기간_개월", event_col="event")
    covariate_means = model_df[COVARIATES].mean().to_dict()
    coefficients = cph.params_.to_dict()
    baseline_curve = [
        {"개월": round(float(m), 2), "S0": round(float(s), 4)}
        for m, s in cph.baseline_survival_.itertuples()
    ]

    # 검증 기간에 실제로 새 계약이 있었던 건물 집합
    buildings_with_new_contract = {building_key(r) for r in validation_records}

    tp = tn = fp = fn = 0
    evaluated = 0

    # cutoff 시점에 이미 중도절단 상태였던(=아직 다음 계약을 못 본) 건물만 평가 대상
    censored_rows = [r for r in survival_rows if not r["event"] and "_cutoff_까지_지난_개월" in r]

    for row in censored_rows:
        t_cutoff = row["_cutoff_까지_지난_개월"]
        t_end = t_cutoff + validation_months

        hazard_ratio_log = sum(
            coefficients[name] * (row[name] - covariate_means[name]) for name in coefficients
        )
        hr = math.exp(hazard_ratio_log)

        s_cutoff = baseline_survival_at(baseline_curve, t_cutoff) ** hr
        s_end = baseline_survival_at(baseline_curve, t_end) ** hr
        predicted_prob = 1 - (s_end / s_cutoff if s_cutoff > 0 else 0)

        predicted_event = predicted_prob >= PREDICTION_THRESHOLD
        actual_event = row["건물키"] in buildings_with_new_contract

        evaluated += 1
        if predicted_event and actual_event:
            tp += 1
        elif not predicted_event and not actual_event:
            tn += 1
        elif predicted_event and not actual_event:
            fp += 1
        else:
            fn += 1

    accuracy = (tp + tn) / evaluated if evaluated else 0.0

    result = {
        "학습_기간_종료일": cutoff.isoformat(),
        "검증_기간_종료일": end_of_window.isoformat(),
        "검증_기간_개월": round(validation_months, 2),
        "평가_대상_건물수": evaluated,
        "일치율": round(accuracy, 4),
        "혼동행렬": {"TP": tp, "TN": tn, "FP": fp, "FN": fn},
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n평가 대상 건물: {evaluated}개")
    print(f"일치율: {accuracy * 100:.1f}% (목표 80% 이상)")
    print(f"혼동행렬: TP={tp} TN={tn} FP={fp} FN={fn}")
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
