"use client";

// 배송완료 메모에 자동으로 붙는 "위치 태그" 지도 링크처럼, 저장된 메모 텍스트 안에 URL이 섞여 있을 때
// 그 부분만 눌러서 바로 열 수 있는 링크로 바꿔줍니다. 나머지 텍스트와 줄바꿈은 그대로 유지합니다.
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export function LinkifiedText({ className, text }: { className?: string; text: string }) {
  // 캡처 그룹이 있는 정규식으로 split하면 매칭된 URL이 홀수 인덱스에 그대로 끼어 들어옵니다(표준 JS 동작).
  // 정규식 상태(lastIndex)에 의존하는 .test() 반복 호출 대신 인덱스 홀짝으로 구분해 버그를 피합니다.
  const parts = text.split(URL_PATTERN);

  return (
    <span className={className}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a
            className="break-all text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900"
            href={part}
            key={`${index}-${part}`}
            rel="noreferrer"
            target="_blank"
          >
            {part}
          </a>
        ) : part ? (
          <span key={`${index}-text`}>{part}</span>
        ) : null
      )}
    </span>
  );
}
