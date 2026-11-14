"use client";
import { useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Search, X } from "lucide-react";

// CC-47-1 공통 검색창: 돋보기 · 값이 있을 때만 오른쪽 × · Esc = 지우기 · × 뒤에도 포커스는 입력칸에 유지.
// 모양은 .maju-search-field 하나(size sm = h-9, md = h-10). 브라우저 기본 ×는 숨긴다(우리 ×와 겹치지 않게).
// 화면마다 쓰던 Enter·디바운스·URL 동기화는 inputProps(onKeyDown 등)와 onChange 쪽에서 그대로 유지한다.
type Props = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** × 또는 Esc. 안 주면 onChange("")로 지운다. */
  readonly onClear?: () => void;
  readonly placeholder?: string;
  readonly "aria-label"?: string;
  readonly size?: "sm" | "md";
  readonly className?: string;
  /** 입력칸 아래에 붙는 것(예: 최근 검색어 펼침). 래퍼가 relative라 absolute로 놓으면 된다. */
  readonly children?: ReactNode;
  readonly inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "placeholder" | "type" | "className"> & Record<`data-${string}`, string>;
};

export function SearchInput({ children, className = "", inputProps, onChange, onClear, placeholder, size = "md", value, ...rest }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clear = () => {
    if (onClear) onClear();
    else onChange("");
    inputRef.current?.focus();
  };
  return (
    <label className={`maju-search-field relative min-w-0 ${size === "sm" ? "!h-9" : ""} ${className}`}>
      <Search aria-hidden="true" className="pointer-events-none h-4 w-4 shrink-0 text-slate-400" />
      <input
        {...inputProps}
        aria-label={rest["aria-label"]}
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-bold text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:border-0 focus:ring-0 [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          inputProps?.onKeyDown?.(event);
          if (event.key === "Escape" && value && !event.defaultPrevented) {
            event.preventDefault();
            clear();
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        type="search"
        value={value}
      />
      {value ? (
        <button
          aria-label="검색어 지우기"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 max-sm:-my-2 max-sm:h-11 max-sm:w-11"
          // 눌러도 입력칸이 포커스를 잃지 않게(onBlur로 닫히는 목록 방지)
          onMouseDown={(event) => event.preventDefault()}
          onClick={clear}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
      {children}
    </label>
  );
}
