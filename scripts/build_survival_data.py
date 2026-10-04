# -*- coding: utf-8 -*-
# monthly_rent.json(정제된 월세 거래 데이터)을 읽어서, 같은 주소·건물 단위로
# "계약이 발생한 뒤 다음 계약까지 걸린 기간"을 생존분석용 데이터로 만든다.
# (PLAN.md 2번 작업, DESIGN.md "2.1 데이터 준비 흐름"의 세 번째 단계)
#
# 생존분석 용어로:
#  - event=True  : 다음 계약이 실제로 관측된 구간 (duration = 두 계약 사이 간격)
#  - event=False : 그 건물의 마지막 계약 이후, 데이터가 끝날 때까지 다음 계약이
#                   아직 관측되지 않은 구간 ("censored" = 중도절단)

import json
import os
from datetime import date

INPUT_PATH = os.path.join("data", "processed", "monthly_rent.json")
OUTPUT_PATH = os.path.join("data", "processed", "survival_data.json")

DAYS_PER_MONTH = 30.44  # 날짜 차이를 '개월' 단위로 환산할 때 쓰는 평균값


def parse_contract_date(record):
    """계약년월('202412') + 계약일('31')을 date 객체로 합친다. 실패하면 None."""
    ym = record.get("계약년월")
    day = record.get("계약일")
    if not ym or not day:
        return None
    try:
        year = int(str(ym)[:4])
        month = int(str(ym)[4:6])
        day_num = int(str(day))
        return date(year, month, day_num)
    except (ValueError, TypeError):
        return None


def building_key(record):
    """같은 주소·건물인지 구분하는 기준 키."""
    return (record.get("시군구"), record.get("번지"), record.get("건물명"))


def main():
    with open(INPUT_PATH, encoding="utf-8") as f:
        records = json.load(f)

    # 각 거래에 실제 날짜를 붙이고, 날짜를 못 만든 거래는 제외한다
    dated_records = []
    for r in records:
        contract_date = parse_contract_date(r)
        if contract_date is not None:
            dated_records.append((building_key(r), contract_date, r))

    if not dated_records:
        raise SystemExit("날짜를 해석할 수 있는 거래가 없습니다.")

    # 전체 데이터에서 가장 마지막 계약일 = "관측이 끝난 시점" (중도절단 기준)
    end_of_window = max(d for _, d, _ in dated_records)

    # 건물별로 거래를 모은다
    buildings = {}
    for key, contract_date, r in dated_records:
        buildings.setdefault(key, {"info": r, "dates": []})
        buildings[key]["dates"].append(contract_date)

    survival_rows = []
    for (sigungu, bunji, building_name), group in buildings.items():
        dates = sorted(group["dates"])
        info = group["info"]

        # 계약과 계약 사이 간격 -> event=True (다음 계약이 실제로 일어남)
        for prev_date, next_date in zip(dates, dates[1:]):
            duration_days = (next_date - prev_date).days
            if duration_days <= 0:
                continue  # 같은 날 중복 신고 등 이상치는 건너뜀
            survival_rows.append({
                "시군구": sigungu,
                "번지": bunji,
                "건물명": building_name,
                "주택유형": info.get("주택유형"),
                "시작일": prev_date.isoformat(),
                "종료일": next_date.isoformat(),
                "기간_일": duration_days,
                "기간_개월": round(duration_days / DAYS_PER_MONTH, 2),
                "event": True,
            })

        # 그 건물의 마지막 계약 이후 ~ 데이터 끝 시점 -> event=False (중도절단)
        last_date = dates[-1]
        censored_days = (end_of_window - last_date).days
        if censored_days > 0:
            survival_rows.append({
                "시군구": sigungu,
                "번지": bunji,
                "건물명": building_name,
                "주택유형": info.get("주택유형"),
                "시작일": last_date.isoformat(),
                "종료일": None,
                "기간_일": censored_days,
                "기간_개월": round(censored_days / DAYS_PER_MONTH, 2),
                "event": False,
            })

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(survival_rows, f, ensure_ascii=False, indent=2)

    event_count = sum(1 for r in survival_rows if r["event"])
    censored_count = len(survival_rows) - event_count

    print(f"건물 수: {len(buildings)}개")
    print(f"관측 종료 시점(기준일): {end_of_window.isoformat()}")
    print(f"생존분석 데이터: 총 {len(survival_rows)}건 (event={event_count}, censored={censored_count})")
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
