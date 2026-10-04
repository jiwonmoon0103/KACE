// 카카오맵 REST API(키워드 검색, 카테고리 검색)를 서버에서 호출하는 함수 모음.
// REST API 키는 서버 전용(.env KAKAO_REST_API_KEY)이라 여기서만 사용하고
// 브라우저로는 절대 내려보내지 않는다.
// (PLAN.md 16번 작업, PRD.md 5-4 "카카오맵 API로 주소를 좌표로 변환")

const KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const CATEGORY_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/category.json";

function authHeaders() {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) throw new Error("KAKAO_REST_API_KEY가 설정되어 있지 않습니다.");
  return { Authorization: `KakaoAK ${apiKey}` };
}

/** 학교 이름으로 장소를 검색해 좌표를 찾는다. 결과가 없으면 null. */
export async function findPlaceByKeyword(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const url = `${KEYWORD_SEARCH_URL}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return null;

  const data = await res.json();
  const doc = data.documents?.[0];
  if (!doc) return null;
  return { lat: Number(doc.y), lng: Number(doc.x) };
}

/** 매물 좌표 기준 반경(m) 안에서 가장 가까운 카테고리 장소까지 거리(m)를 찾는다. */
export async function findNearestCategoryDistance(
  center: { lat: number; lng: number },
  categoryGroupCode: "CS2" | "CE7",
  radiusMeters = 1000,
): Promise<number | null> {
  const url =
    `${CATEGORY_SEARCH_URL}?category_group_code=${categoryGroupCode}` +
    `&x=${center.lng}&y=${center.lat}&radius=${radiusMeters}&sort=distance`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return null;

  const data = await res.json();
  const doc = data.documents?.[0];
  if (!doc) return null;
  return Number(doc.distance); // 카카오가 이미 미터 단위 거리를 계산해서 내려준다
}
