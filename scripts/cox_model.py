# -*- coding: utf-8 -*-
# survival_data.json(건물 단위 생존 시간)에 전용면적·건물연식·주택유형 같은
# 매물 특성을 붙여 Cox 비례위험모형을 학습하고, 계수와 기준 생존곡선을
# JSON으로 저장한다. 실제 서비스(Next.js)는 이 JSON의 숫자만 가져다
# "S(t|x) = 기준생존곡선(t) ^ exp(계수 합)" 공식으로 1~12개월 확률을 계산한다.
# (PLAN.md 4번 작업, PRD.md 5-1 "분석 방법")

import json
import math
import os

import pandas as pd
from lifelines import CoxPHFitter

SURVIVAL_PATH = os.path.join("data", "processed", "survival_data.json")
MONTHLY_RENT_PATH = os.path.join("data", "processed", "monthly_rent.json")
OUTPUT_PATH = os.path.join("data", "processed", "cox_model.json")

COVARIATES = ["전용면적", "건물연식", "주택유형_연립", "주택유형_오피스텔"]


def building_key(row):
    return (row["시군구"], row["번지"], row["건물명"])


def build_dataframe():
    with open(SURVIVAL_PATH, encoding="utf-8") as f:
        survival_rows = json.load(f)
    with open(MONTHLY_RENT_PATH, encoding="utf-8") as f:
        rent_rows = json.load(f)

    rent_df = pd.DataFrame(rent_rows)
    rent_df["건물키"] = list(zip(rent_df["시군구"], rent_df["번지"], rent_df["건물명"]))

    # 건물별 대표 특성: 전용면적은 평균, 건축년도는 중앙값(한 건물은 보통 건축년도가 동일함)
    building_stats = rent_df.groupby("건물키").agg(
        전용면적=("전용면적", "mean"),
        건축년도=("건축년도", "median"),
    )

    # 연식 계산 기준 연도 = 데이터에 있는 가장 최근 계약년도
    reference_year = int(rent_df["계약년월"].astype(str).str[:4].astype(int).max())
    building_stats["건물연식"] = reference_year - building_stats["건축년도"]

    survival_df = pd.DataFrame(survival_rows)
    survival_df["건물키"] = list(zip(
        survival_df["시군구"], survival_df["번지"], survival_df["건물명"],
    ))

    df = survival_df.join(building_stats, on="건물키")
    df["주택유형"] = df["주택유형"].fillna("다세대")
    # "다세대"를 기준(reference) 카테고리로 두고, 나머지만 더미 변수로 만든다
    df["주택유형_연립"] = (df["주택유형"] == "연립").astype(int)
    df["주택유형_오피스텔"] = (df["주택유형"] == "오피스텔").astype(int)

    return df


def main():
    df = build_dataframe()
    model_df = df[["기간_개월", "event"] + COVARIATES].dropna()
    dropped = len(df) - len(model_df)
    print(f"학습에 사용할 데이터: {len(model_df)}건 (특성값 없어서 제외: {dropped}건)")

    cph = CoxPHFitter()
    cph.fit(model_df, duration_col="기간_개월", event_col="event")

    covariate_means = model_df[COVARIATES].mean().to_dict()
    coefficients = cph.params_.to_dict()
    baseline_survival = [
        {"개월": round(float(month), 2), "S0": round(float(s0), 4)}
        for month, s0 in cph.baseline_survival_.itertuples()
    ]

    result = {
        "기준_주택유형": "다세대",
        "공변량_평균": {k: round(float(v), 3) for k, v in covariate_means.items()},
        "계수": {k: round(float(v), 6) for k, v in coefficients.items()},
        "기준_생존곡선": baseline_survival,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Cox 모형 계수: {result['계수']}")
    print(f"저장 위치: {OUTPUT_PATH}")

    # --- 직접 확인용 자체 테스트: 샘플 매물 하나로 1/3/6/12개월 확률을 계산해본다 ---
    sample = model_df.iloc[0]
    print("\n[자체 테스트] 샘플 매물 공변량:", {c: sample[c] for c in COVARIATES})
    for months in (1, 3, 6, 12):
        prob = probability_of_contract(result, sample, months)
        print(f"  {months}개월 안에 계약될 확률: {prob * 100:.1f}%")


def probability_of_contract(cox_result, covariates, months):
    """cox_model.json과 같은 구조의 결과로, 주어진 매물이 months개월 안에
    계약될 확률을 계산한다. (Next.js에서 그대로 옮겨 구현할 공식의 파이썬 버전)
    """
    means = cox_result["공변량_평균"]
    coef = cox_result["계수"]
    hazard_ratio_log = sum(
        coef[name] * (covariates[name] - means[name]) for name in coef
    )
    curve = cox_result["기준_생존곡선"]

    # months개월 이하인 지점 중 가장 늦은 시점의 S0을 사용 (계단 함수)
    s0 = 1.0
    for point in curve:
        if point["개월"] <= months:
            s0 = point["S0"]
        else:
            break

    survival_prob = s0 ** math.exp(hazard_ratio_log)
    return 1 - survival_prob


if __name__ == "__main__":
    main()
