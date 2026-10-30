import pg from "pg";
export async function checkP1Concurrency(url) {
  const clients = [
    new pg.Client({ connectionString: url }),
    new pg.Client({ connectionString: url }),
  ];
  await Promise.all(clients.map((c) => c.connect()));
  const [a, b] = clients,
    c = "00000000-0000-4000-8000-000000000031",
    p = "10000000-0000-4000-8000-000000000031",
    id = "20000000-0000-4000-8000-000000000031",
    actor = "c".repeat(64);
  try {
    await a.query("insert into companies values($1)", [c]);
    await a.query(
      "insert into product_catalog(id,company_id,purchase_product_name,purchase_price) values($1,$2,'synthetic',100)",
      [p, c],
    );
    const line = {
      productId: p,
      displayName: "합성 공개 상품",
      brand: "",
      spec: "",
      unit: "개",
      price: 100,
      taxType: "exempt",
      visible: true,
      promotionId: null,
    };
    const content = {
      kind: "quote",
      title: "동시 저장",
      companyName: "합성 회사",
      contact: "",
      recipient: "",
      footer: "",
      validUntil: "2099-01-01",
      theme: "mono",
      layout: "table",
      showPrice: true,
      showBrand: true,
      showSpec: true,
      lines: [line],
    };
    await a.query("select pricing_p1($1,$2,false,$3,$4)", [
      c,
      actor,
      "save",
      { id, expected: 0, content },
    ]);
    const publish = await Promise.all(
      clients.map((client) =>
        client.query("select pricing_p1($1,$2,false,$3,$4) value", [
          c,
          actor,
          "publish",
          { id, expected: 1 },
        ]),
      ),
    );
    if (publish[0].rows[0].value.id !== publish[1].rows[0].value.id)
      throw new Error("Concurrent publish duplicated version");
    const saves = await Promise.allSettled(
      clients.map((client, i) =>
        client.query("select pricing_p1($1,$2,false,$3,$4)", [
          c,
          actor,
          "save",
          { id, expected: 1, content: { ...content, title: "동시 수정 " + i } },
        ]),
      ),
    );
    if (saves.filter((r) => r.status === "fulfilled").length !== 1)
      throw new Error("Concurrent save lost-update protection failed");
    console.log(
      "PASS PG16 P1 concurrent publish idempotency / stale save conflict",
    );
  } finally {
    await a.query("delete from companies where id=$1", [c]);
    await Promise.all(clients.map((client) => client.end()));
  }
}
