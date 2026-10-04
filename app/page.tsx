import Link from "next/link";
import KakaoMap from "./components/KakaoMap";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background font-sans text-foreground">
      <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-background/90 px-4 py-3 shadow-sm backdrop-blur sm:px-6 sm:py-4">
        {/* 제목을 화면 중앙에 두기 위해, 오른쪽 버튼과 같은 너비의 투명 자리맞춤 요소를 왼쪽에 둔다 */}
        <span aria-hidden="true" className="invisible shrink-0 rounded-full px-4 py-2 text-sm font-medium">
          룸메이트 찾기
        </span>
        <h1 className="min-w-0 truncate text-center text-base font-semibold text-foreground sm:text-lg">
          대학생을 위한 자취방을 구해줘~
        </h1>
        <Link
          href="/roommate"
          className="shrink-0 justify-self-end rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition hover:opacity-90"
        >
          룸메이트 찾기
        </Link>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-6 pt-4 sm:px-6 sm:pb-8">
        <KakaoMap />
      </main>
    </div>
  );
}
