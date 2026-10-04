// 매물에서 학교/편의점/카페까지의 거리를 계산하는 API.
// 기준점은 "매물 위치"다 (학교 위치가 기준이 아님).
// - 학교: 사용자가 입력한 학교 이름으로 좌표를 찾아 직선거리를 도보 분으로 환산
// - 편의점/카페: 매물 반경 1km 안에서 가장 가까운 곳까지의 거리 (카카오가 바로 계산해줌)
// (PLAN.md 16번 작업, PRD.md 5-4 "편의점·학교·카페와의 거리")

import { NextResponse } from "next/server";
import { getListingCoordinates } from "@/lib/listings";
import { findNearestCategoryDistance, findPlaceByKeyword } from "@/lib/kakaoLocal";
import { haversineDistanceMeters, metersToWalkingMinutes } from "@/lib/distance";

const RADIUS_METERS = 1000;

export async function POST(request: Request) {
  const body = await request.json();
  const { 시군구, 번지, 건물명, school } = body ?? {};

  if (
    typeof 시군구 !== "string" ||
    typeof 번지 !== "string" ||
    typeof 건물명 !== "string"
  ) {
    return NextResponse.json(
      { error: "시군구/번지/건물명 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const listingCoords = await getListingCoordinates({ 시군구, 번지, 건물명 });
  if (!listingCoords) {
    return NextResponse.json({ error: "매물 좌표를 찾을 수 없습니다." }, { status: 404 });
  }

  const [convenienceMeters, cafeMeters] = await Promise.all([
    findNearestCategoryDistance(listingCoords, "CS2", RADIUS_METERS),
    findNearestCategoryDistance(listingCoords, "CE7", RADIUS_METERS),
  ]);

  let schoolResult: { 분: number | null; 상태: "ok" | "not_found" | "없음" } = {
    분: null,
    상태: "없음",
  };

  if (typeof school === "string" && school.trim() !== "") {
    const schoolCoords = await findPlaceByKeyword(school.trim());
    if (schoolCoords) {
      const meters = haversineDistanceMeters(listingCoords, schoolCoords);
      schoolResult = { 분: metersToWalkingMinutes(meters), 상태: "ok" };
    } else {
      schoolResult = { 분: null, 상태: "not_found" };
    }
  }

  return NextResponse.json({
    학교: schoolResult,
    편의점_분: convenienceMeters != null ? metersToWalkingMinutes(convenienceMeters) : null,
    카페_분: cafeMeters != null ? metersToWalkingMinutes(cafeMeters) : null,
  });
}
