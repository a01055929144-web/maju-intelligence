import { isFeatureEnabled } from "./feature-flags";

export function accountLoginV2Enabled() {
  return isFeatureEnabled("ACCOUNT_LOGIN_V2");
}
