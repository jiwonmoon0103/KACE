// 두 좌표 사이의 직선 거리(m)를 계산하고, 도보 기준 분(分)으로 환산한다.
// (PLAN.md 16번 작업, PRD.md 5-4 "거리는 도보 기준 분 단위로 표시한다")

const EARTH_RADIUS_METERS = 6371000;
const WALKING_METERS_PER_MINUTE = 67; // 시속 약 4km 기준 도보 속도
// 카카오 API는 일반 개발자용 "도보 길찾기"를 제공하지 않아서(자동차 길찾기만 있음),
// 직선거리를 그대로 쓰지 않고 도심 보행 보정계수를 곱해 실제 경로에 가깝게 추정한다.
// (건물을 돌아가거나 신호등을 건너는 현실적인 거리 반영, 업계에서 흔히 쓰는 경험적 값)
const URBAN_WALKING_ROUTE_FACTOR = 1.3;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 위도/경도 두 점 사이의 직선 거리(m)를 하버사인 공식으로 계산한다. */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}

/** 직선거리(m)를 도보 경로 보정 후 분(分) 단위로 환산한다 (최소 1분). */
export function metersToWalkingMinutes(straightLineMeters: number): number {
  const routeMeters = straightLineMeters * URBAN_WALKING_ROUTE_FACTOR;
  return Math.max(1, Math.round(routeMeters / WALKING_METERS_PER_MINUTE));
}
