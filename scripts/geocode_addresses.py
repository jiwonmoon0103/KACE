# -*- coding: utf-8 -*-
# 전체 매물 주소를 카카오맵 REST API로 미리 좌표(위도·경도)로 변환해 저장한다.
# 여기서 한 번만 변환해두면, 서비스가 실제로 돌아갈 때는 매번 지도 API를
# 호출하지 않고 이 파일만 읽어서 바로 지도에 핀을 찍을 수 있다.
# (PLAN.md 8번 작업, DESIGN.md 2.1 "카카오맵 REST API로 전체 주소를 좌표로 변환")

import json
import os
import time

import requests
from dotenv import load_dotenv

TREND_BY_BUILDING_PATH = os.path.join("data", "processed", "trend_by_building.json")
MONTHLY_RENT_PATH = os.path.join("data", "processed", "monthly_rent.json")
OUTPUT_PATH = os.path.join("data", "processed", "geocoded_buildings.json")

KAKAO_ADDRESS_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/address.json"
REQUEST_DELAY_SECONDS = 0.1  # 카카오 서버에 너무 빠르게 연속 요청하지 않도록 간격을 둔다


def building_key(record):
    return (record.get("시군구"), record.get("번지"), record.get("건물명"))


def load_buildings():
    """건물 목록(지번 주소) + 대표 도로명(지번 검색이 안 될 때 대신 쓸 주소)을 불러온다."""
    with open(TREND_BY_BUILDING_PATH, encoding="utf-8") as f:
        buildings = json.load(f)

    with open(MONTHLY_RENT_PATH, encoding="utf-8") as f:
        rent_records = json.load(f)

    road_address_by_key = {}
    for r in rent_records:
        key = building_key(r)
        if key not in road_address_by_key and r.get("도로명"):
            road_address_by_key[key] = r["도로명"]

    for b in buildings:
        key = (b["시군구"], b["번지"], b["건물명"])
        b["도로명"] = road_address_by_key.get(key)

    return buildings


def search_address(query, api_key):
    """카카오 주소 검색 API 호출. 결과가 있으면 (위도, 경도)를, 없으면 None을 반환."""
    response = requests.get(
        KAKAO_ADDRESS_SEARCH_URL,
        headers={"Authorization": f"KakaoAK {api_key}"},
        params={"query": query},
        timeout=5,
    )
    if response.status_code == 401:
        raise RuntimeError(
            "카카오 REST API 키가 올바르지 않습니다 (401 Unauthorized). "
            ".env의 KAKAO_REST_API_KEY 값을 확인해주세요."
        )
    if response.status_code == 403:
        raise RuntimeError(
            "카카오 개발자 콘솔에서 이 앱의 '카카오맵' 제품이 꺼져 있습니다 (403 Forbidden). "
            "https://developers.kakao.com -> 내 애플리케이션 -> 해당 앱 -> "
            "제품 설정 -> 카카오맵(지도/로컬) -> 활성화 로 켜주세요."
        )
    response.raise_for_status()

    documents = response.json().get("documents", [])
    if not documents:
        return None
    doc = documents[0]
    return float(doc["y"]), float(doc["x"])  # (위도, 경도)


def main():
    load_dotenv()
    api_key = os.environ.get("KAKAO_REST_API_KEY")
    if not api_key:
        raise SystemExit(".env에 KAKAO_REST_API_KEY가 없습니다.")

    buildings = load_buildings()
    print(f"좌표 변환 대상: {len(buildings)}개 건물")

    results = []
    success_count = 0
    for i, b in enumerate(buildings, start=1):
        jibun_address = f"{b['시군구']} {b['번지']}"
        coords = search_address(jibun_address, api_key)

        used_address = jibun_address
        if coords is None and b.get("도로명"):
            # 지번 주소로 못 찾으면 도로명 주소로 한 번 더 시도
            road_address = f"{b['시군구'].rsplit(' ', 1)[0]} {b['도로명']}"
            coords = search_address(road_address, api_key)
            used_address = road_address

        if coords is not None:
            success_count += 1
        lat, lng = coords if coords else (None, None)

        results.append({
            "시군구": b["시군구"],
            "번지": b["번지"],
            "건물명": b["건물명"],
            "위도": lat,
            "경도": lng,
            "geocode_성공": coords is not None,
            "조회한_주소": used_address,
        })

        if i % 200 == 0:
            print(f"  진행: {i}/{len(buildings)} (성공 {success_count}건)")

        time.sleep(REQUEST_DELAY_SECONDS)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n성공: {success_count}/{len(results)}건 "
          f"({success_count / len(results) * 100:.1f}%)")
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
