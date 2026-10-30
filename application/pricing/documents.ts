import { calculatePrice } from "../../domains/pricing/price-rules";
import {
  dateField,
  field,
  isId,
  money,
  object,
  parseDocument,
} from "../../domains/pricing/document";
export type DocumentScope = {
  companyId: string;
  actor: string;
  manager: boolean;
};
export interface PricingDocumentsRepository {
  request<T>(scope: DocumentScope, action: string, payload: object): Promise<T>;
}
export function pricingDocuments(repository: PricingDocumentsRepository) {
  return {
    read<T>(scope: DocumentScope, action: string, payload: object) {
      if (
        ![
          "list",
          "catalog",
          "versions",
          "promotions",
          "sets",
          "profile",
        ].includes(action)
      )
        throw new Error("조회 요청을 확인해 주세요.");
      return repository.request<T>(scope, action, payload);
    },
    execute<T>(scope: DocumentScope, input: unknown) {
      const body = object(input),
        action = field(body.action, 30, true),
        id = body.id;
      if (!isId(id)) throw new Error("저장 번호를 확인해 주세요.");
      if (!Number.isSafeInteger(body.expected) || Number(body.expected) < 0)
        throw new Error("저장 버전을 확인해 주세요.");
      const expected = Number(body.expected);
      if (action === "save") {
        const content = parseDocument(body.content);
        if (!scope.manager && content.kind !== "quote")
          throw new Error("견적서만 작성할 수 있습니다.");
        return repository.request<T>(scope, action, { id, expected, content });
      }
      if (
        action === "publish" ||
        action === "delete-set" ||
        action === "delete-promotion"
      )
        return repository.request<T>(scope, action, { id, expected });
      const d = object(body.content);
      if (action === "save-promotion") {
        if (!scope.manager || !isId(d.productId))
          throw new Error("행사 관리 권한을 확인해 주세요.");
        const startsOn = dateField(d.startsOn),
          endsOn = dateField(d.endsOn);
        if (d.taxType !== "taxable" && d.taxType !== "exempt")
          throw new Error("과세를 확인해 주세요.");
        calculatePrice(Number(d.cost), Number(d.margin), 10);
        if (d.perStoreLimit === 0)
          throw new Error(
            "매장별 최대 수량은 1 이상 또는 빈 값으로 입력해 주세요.",
          );
        if (
          startsOn > endsOn ||
          typeof d.cost !== "number" ||
          d.cost < 0 ||
          !Number.isFinite(d.cost) ||
          typeof d.margin !== "number" ||
          d.margin < 0 ||
          d.margin > 1000 ||
          Math.abs(d.margin * 100 - Math.round(d.margin * 100)) > 1e-8
        )
          throw new Error("행사 기간·매입가·마진율을 확인해 주세요.");
        return repository.request<T>(scope, action, {
          id,
          expected,
          content: {
            productId: d.productId,
            name: field(d.name, 120, true),
            displayName: field(d.displayName, 120, true),
            startsOn,
            endsOn,
            cost: d.cost,
            margin: d.margin,
            stock: d.stock === null ? null : money(d.stock),
            perStoreLimit:
              d.perStoreLimit === null ? null : money(d.perStoreLimit),
            allowSheet: d.allowSheet === true,
            badge: d.badge === "임박" ? "임박" : "행사",
            taxType: d.taxType,
          },
        });
      }
      if (action === "save-set") {
        if (
          !Array.isArray(d.productIds) ||
          !d.productIds.length ||
          d.productIds.length > 100 ||
          !d.productIds.every(isId) ||
          new Set(d.productIds).size !== d.productIds.length
        )
          throw new Error("품목 번호는 중복 없이 1~100개를 선택해 주세요.");
        if (d.shared === true && !scope.manager)
          throw new Error("공용 묶음·템플릿은 대표·관리자가 저장합니다.");
        return repository.request<T>(scope, action, {
          id,
          expected,
          content: {
            name: field(d.name, 100, true),
            kind: d.kind === "template" ? "template" : "bundle",
            shared: d.shared === true,
            productIds: d.productIds,
          },
        });
      }
      if (action === "save-profile" && scope.manager)
        return repository.request<T>(scope, action, {
          id,
          expected,
          content: {
            companyName: field(d.companyName, 100, true),
            contact: field(d.contact, 100),
            footer: field(d.footer, 400),
          },
        });
      throw new Error("저장 요청을 확인해 주세요.");
    },
  };
}
