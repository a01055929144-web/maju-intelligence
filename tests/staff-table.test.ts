
describe("invite screen hides the answer (11/4)", () => {
  it("masks the last four digits and asks for them", () => {
    const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    expect(store).toContain("-****-****");
    const gate = readFileSync(resolve(process.cwd(), "components/invite-phone-gate.tsx"), "utf8");
    expect(gate).toContain("휴대폰 번호 뒷자리 4자리를 입력해 주세요");
  });
});
