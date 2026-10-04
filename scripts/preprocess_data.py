# -*- coding: utf-8 -*-
# public_data/ 안의 국토부 실거래가 엑셀 12개(연도별 x 연립다세대/오피스텔)를 읽어
# 컬럼명을 통일하고 월세 데이터만 걸러낸 뒤 data/processed/monthly_rent.json 으로 저장한다.
# (PLAN.md 1번 작업, DESIGN.md "2.1 데이터 준비 흐름"에 해당)

import glob
import json
import os
import re

import openpyxl

PUBLIC_DATA_DIR = "public_data"
OUTPUT_PATH = os.path.join("data", "processed", "monthly_rent.json")

# 엑셀 파일은 13행이 컬럼 헤더, 14행부터 실제 데이터
HEADER_ROW = 13

# 오피스텔 파일에는 "주택유형" 컬럼이 없어서 직접 채워준다
HOUSING_TYPE_BY_FILE_HINT = {
    "오피스텔": "오피스텔",
}


def to_number(value):
    """'21,000' 같은 콤마 섞인 문자열이나 빈 값을 숫자로 바꾼다. 변환 안 되면 None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    text = str(value).replace(",", "").strip()
    if text in ("", "-"):
        return None
    try:
        return int(text)
    except ValueError:
        try:
            return float(text)
        except ValueError:
            return None


def parse_contract_months(contract_period):
    """'202502~202702' 형식의 계약기간 문자열을 개월 수로 바꾼다. 알 수 없으면 None."""
    if not contract_period or contract_period in ("-", ""):
        return None
    match = re.match(r"^\s*(\d{6})\s*~\s*(\d{6})\s*$", str(contract_period))
    if not match:
        return None
    start, end = match.groups()
    start_year, start_month = int(start[:4]), int(start[4:])
    end_year, end_month = int(end[:4]), int(end[4:])
    return (end_year - start_year) * 12 + (end_month - start_month)


def load_one_file(path):
    """엑셀 파일 한 개를 읽어 월세 행만 정제된 dict 리스트로 반환한다."""
    filename = os.path.basename(path)
    is_officetel = "오피스텔" in filename

    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active

    headers = [cell.value for cell in ws[HEADER_ROW]]
    rows = []

    for row in ws.iter_rows(min_row=HEADER_ROW + 1, values_only=True):
        record = dict(zip(headers, row))
        if not record.get("시군구"):
            continue
        if record.get("전월세구분") != "월세":
            continue

        building_name = record.get("건물명") or record.get("단지명")
        housing_type = record.get("주택유형") or ("오피스텔" if is_officetel else None)
        contract_months = parse_contract_months(record.get("계약기간"))

        rows.append({
            "시군구": record.get("시군구"),
            "번지": record.get("번지"),
            "건물명": building_name,
            "도로명": record.get("도로명"),
            "주택유형": housing_type,
            "전용면적": to_number(record.get("전용면적(㎡)")),
            "계약년월": record.get("계약년월"),
            "계약일": record.get("계약일"),
            "보증금": to_number(record.get("보증금(만원)")),
            "월세금": to_number(record.get("월세금(만원)")),
            "층": to_number(record.get("층")),
            "건축년도": to_number(record.get("건축년도")),
            "계약기간": record.get("계약기간"),
            "계약구분": record.get("계약구분"),
            "계약개월수": contract_months,
            # PRD 규칙: 임대 기간 6개월 이하만 단기임대로 분류 (계약기간 정보가 없으면 판단 불가 -> None)
            "단기임대여부": (contract_months is not None and contract_months <= 6),
        })

    return rows


def main():
    files = sorted(glob.glob(os.path.join(PUBLIC_DATA_DIR, "*.xlsx")))
    if not files:
        raise SystemExit(f"'{PUBLIC_DATA_DIR}' 폴더에서 엑셀 파일을 찾지 못했습니다.")

    all_rows = []
    for path in files:
        rows = load_one_file(path)
        print(f"{os.path.basename(path)}: 월세 {len(rows)}건")
        all_rows.extend(rows)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=2)

    short_term_count = sum(1 for r in all_rows if r["단기임대여부"])
    unique_buildings = len({(r["시군구"], r["번지"], r["건물명"]) for r in all_rows})

    print("---")
    print(f"총 월세 데이터: {len(all_rows)}건")
    print(f"고유 주소(건물) 수: {unique_buildings}개")
    print(f"단기임대(6개월 이하) 건수: {short_term_count}건")
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
