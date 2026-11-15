import { Toast } from "@/components/ui/notice";

type MapVehicleConnectionToastProps = {
  readonly driverLabel: string;
};

// 47-6: 공통 Toast(성공 = role="status" · aria-live="polite" · aria-atomic) 위에 접속 표시(깜빡이는 점)만 얹는다. 사라지는 시간은 부모(NOTICE_TOAST_MS)가 정한다.
export function MapVehicleConnectionToast({ driverLabel }: MapVehicleConnectionToastProps) {
  return (
    <Toast
      icon={
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
      }
      kind="success"
    >
      {driverLabel} 기사님이 접속했습니다
    </Toast>
  );
}
