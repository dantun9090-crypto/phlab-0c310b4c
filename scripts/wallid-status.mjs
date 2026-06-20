const ids = [
  ['PHP-MQMVOSO2','0a5064d9-aad3-413f-931d-2f9fcf29ea92'],
  ['PHP-MQLLVECH','7ce6d224-3f47-4ece-9368-ac75c17db4d7'],
  ['PHP-MQLLBSD2','05b8e9af-6979-4fde-a7f6-614ff76df2ab'],
  ['PHP-MQLKPEZX','f7c2a4b7-4354-4e0b-9326-49d55a70bb61'],
];
const tok = Buffer.from(`${process.env.WALLID_KEY_ID}:${process.env.WALLID_KEY_SECRET}`).toString('base64');
for (const [oid, pid] of ids) {
  const r = await fetch(`https://payment-api.wallid.co/api/payment-gw/v1/status?apiPaymentId=${pid}`, {
    headers: { authorization: `Basic ${tok}`, accept: 'application/json' },
  });
  const t = await r.text();
  console.log(oid, r.status, t.slice(0,400));
}
