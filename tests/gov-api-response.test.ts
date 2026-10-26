import { describe, expect, it } from "vitest";
import { parseGovApiFailure } from "../lib/gov-api-response";

describe("parseGovApiFailure", () => {
  it("extracts a JSON result code and message without echoing a service key", () => {
    const failure = parseGovApiFailure(JSON.stringify({
      response: { header: { resultCode: "SERVICE_ACCESS_DENIED_ERROR", resultMsg: "serviceKey=private-key is denied" } }
    }), "private-key");
    expect(failure).toEqual({ resultCode: "SERVICE_ACCESS_DENIED_ERROR", resultMessage: "serviceKey=[redacted] is denied" });
    expect(JSON.stringify(failure)).not.toContain("private-key");
  });

  it("extracts XML error fields and does not return an HTML upstream body", () => {
    expect(parseGovApiFailure("<response><resultCode>22</resultCode><resultMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</resultMsg></response>", "key"))
      .toEqual({ resultCode: "22", resultMessage: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" });
    expect(parseGovApiFailure("<html>Forbidden serviceKey=private-key</html>", "private-key"))
      .toEqual({ resultCode: null, resultMessage: null });
  });
});
