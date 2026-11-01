type MapVehicleConnectionToastProps = {
  readonly driverLabel: string;
};

export function MapVehicleConnectionToast({ driverLabel }: MapVehicleConnectionToastProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(5,150,105,0.35)]"
        role="status"
      >
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        {driverLabel} 기사님이 접속했습니다
      </div>
    </div>
  );
}
