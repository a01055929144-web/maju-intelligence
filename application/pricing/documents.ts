import { calculatePrice } from "../../domains/pricing/price-rules";
import { DocumentSendError, parseDocumentSend } from "../../domains/pricing/document-send";
import { parseDocumentShare } from "../../domains/pricing/document-share";
import {
  DOCUMENT_QR_POSITIONS, DOCUMENT_QR_SIZES, documentQrDisplay,
  dateField,
  field,
  isId,
  money,
  object,
  parseDocument,
  PricingInputError,
} from "../../domains/pricing/document";
export type DocumentScope = {
  companyId: string;
  actor: string;
  manager: boolean;
  archiveEnabled?: boolean;
  sharingEnabled?: boolean;
  actorName?: string;
  documentVatEnabled?: boolean;
  qrDisplayEnabled?: boolean;
};
export interface PricingDocumentsRepository {
  request<T>(scope: DocumentScope, action: string, payload: object): Promise<T>;
}
function extensionMode(value: unknown) {
  if (value !== "keep" && value !== "latest") throw new PricingInputError("연장 방법을 확인해 주세요.");
  return value;
}
function extensionToken(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new PricingInputError("연장 확인을 다시 진행해 주세요.");
  return value;
}
export function pricingDocuments(repository: PricingDocumentsRepository) {
  return {
    read<T>(scope: DocumentScope, action: string, payload: object) {
      if (action === "qr-display") {
        if (!scope.qrDisplayEnabled) throw new DocumentSendError("QR 표시 설정을 사용할 수 없습니다.", 404);
        if (!("id" in payload) || !isId(payload.id)) throw new PricingInputError("문서를 확인해 주세요.");
        return repository.request<T>(scope, action, { id: payload.id });
      }
      if (
        ![
          "list",
          "catalog",
          "versions",
          "promotions",
          "profile",
        ].includes(action)
      )
        // CC-35: 묶음·템플릿("sets")은 기능 자체를 없앴다 — 부르면 없는 요청(404).
        throw action === "sets" ? new DocumentSendError("없어진 기능입니다.", 404) : new PricingInputError("조회 요청을 확인해 주세요.");
      return repository.request<T>(scope, action, payload);
    },
    execute<T>(scope: DocumentScope, input: unknown) {
      const body = object(input),
        action = field(body.action, 30, true),
        id = body.id;
      if (action === "record-send") return repository.request<T>(scope, action, parseDocumentSend(body));
      if (action === "prepare-share") return repository.request<T>(scope, action, parseDocumentShare(body));
      if (action === "revoke-share") {
        if (!isId(body.shareLinkId)) throw new DocumentSendError("공유 링크를 확인해 주세요.", 400);
        return repository.request<T>(scope, action, { shareLinkId: body.shareLinkId.toLowerCase() });
      }
      if (action === "save-set" || action === "delete-set") throw new DocumentSendError("없어진 기능입니다.", 404);
      if (!isId(id)) throw new PricingInputError("저장 번호를 확인해 주세요.");
      if (!Number.isSafeInteger(body.expected) || Number(body.expected) < 0)
        throw new PricingInputError("저장 버전을 확인해 주세요.");
      const expected = Number(body.expected);
      if (action === "save-qr-display") {
        if (!scope.qrDisplayEnabled) throw new DocumentSendError("QR 표시 설정을 사용할 수 없습니다.", 404);
        if (expected < 1 || expected >= Number.MAX_SAFE_INTEGER) throw new PricingInputError("저장 버전을 확인해 주세요.");
        const settings = documentQrDisplay(body.settings);
        const raw = object(body.settings);
        if (!(DOCUMENT_QR_POSITIONS as readonly unknown[]).includes(raw.position) || !(DOCUMENT_QR_SIZES as readonly unknown[]).includes(raw.size))
          throw new PricingInputError("QR 위치와 크기를 확인해 주세요.");
        return repository.request<T>(scope, action, { id, expected, settings });
      }
      if (action === "archive") {
        if (!scope.archiveEnabled || expected < 1 || typeof body.archived !== "boolean") throw new PricingInputError("문서 보관을 사용할 수 없습니다.");
        return repository.request<T>(scope, action, { id, expected, archived: body.archived });
      }
      if (action === "extension-review") {
        const mode = extensionMode(body.mode), validUntil = dateField(body.validUntil);
        if (body.stage !== "start" && body.stage !== "review") throw new PricingInputError("연장 확인 단계를 확인해 주세요.");
        return repository.request<T>(scope, action, { id, expected, mode, validUntil, stage: body.stage,
          ...(body.stage === "review" ? { content: parseDocument(body.content) } : {}) });
      }
      if (action === "extension-catalog") {
        const mode = extensionMode(body.mode);
        if (!Array.isArray(body.productIds) || body.productIds.length < 1 || body.productIds.length > 100 || body.productIds.some(value => !isId(value)))
          throw new PricingInputError("연장할 품목을 확인해 주세요.");
        return repository.request<T>(scope, action, { id, expected, mode, productIds: Array.from(new Set(body.productIds)) });
      }
      if (action === "extension-save") {
        const content = parseDocument(body.content), mode = extensionMode(body.mode);
        if (!scope.manager && content.kind !== "quote") throw new PricingInputError("견적서만 작성할 수 있습니다.");
        return repository.request<T>(scope, action, { id, expected, mode, content });
      }
      if (action === "extension-publish") {
        if (!isId(body.idempotencyKey)) throw new PricingInputError("게시 재시도 키를 확인해 주세요.");
        return repository.request<T>(scope, action, { id, expected, mode: extensionMode(body.mode), token: extensionToken(body.token), idempotencyKey: body.idempotencyKey });
      }
      if (action === "save") {
        const content = parseDocument(body.content);
        if (content.priceContract && !scope.documentVatEnabled)
          throw new PricingInputError("포함 행사 가격 문서 편집이 꺼져 있습니다. 관리자에게 설정을 확인해 주세요.");
        if (!scope.manager && content.kind !== "quote")
          throw new PricingInputError("견적서만 작성할 수 있습니다.");
        return repository.request<T>(scope, action, { id, expected, content });
      }
      if (
        action === "publish" ||
        action === "delete-promotion"
      )
        return repository.request<T>(scope, action, { id, expected });
      const d = object(body.content);
      if (action === "save-promotion") {
        if (!scope.manager || !isId(d.productId))
          throw new PricingInputError("행사 관리 권한을 확인해 주세요.");
        const startsOn = dateField(d.startsOn),
          endsOn = dateField(d.endsOn);
        if (d.taxType !== "taxable" && d.taxType !== "exempt")
          throw new PricingInputError("과세를 확인해 주세요.");
        calculatePrice(Number(d.cost), Number(d.margin), 10);
        if (d.perStoreLimit === 0)
          throw new PricingInputError(
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
          throw new PricingInputError("행사 기간·매입가·마진율을 확인해 주세요.");
        return repository.request<T>(scope, action, {
          id,
          expected,
          content: {
            productId: d.productId,
            name: field(d.name, 120, true, "행사 상품 이름"),
            displayName: field(typeof d.displayName === "string" && d.displayName.trim() ? d.displayName : d.name, 120, true, "노출 이름"),
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
      throw new PricingInputError("저장 요청을 확인해 주세요.");
    },
  };
}
