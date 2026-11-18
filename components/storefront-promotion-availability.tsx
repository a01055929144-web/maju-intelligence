"use client";

import { promotionAvailabilityLabels, type PromotionAvailability } from "@/domains/order/promotion-availability";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function StorefrontPromotionAvailability({ availability, unit, busy = false, onRetry }: {
  readonly availability: PromotionAvailability;
  readonly unit: string;
  readonly busy?: boolean;
  readonly onRetry?: () => void;
}) {
  const labels = promotionAvailabilityLabels(availability, unit);
  return <div className="flex flex-wrap items-center gap-2" aria-label="행사 수량 안내">
    <Badge>{labels.remaining}</Badge>
    {labels.limit && <Badge>{labels.limit}</Badge>}
    {availability.state === "unavailable" && onRetry && <Button variant="outline" className="min-h-[52px]" disabled={busy} onClick={onRetry} type="button">행사 잔량 다시 확인</Button>}
  </div>;
}
