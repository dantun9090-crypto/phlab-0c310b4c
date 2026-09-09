const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
console.log('have url',!!url,'have key',!!key);
for(const id of ['PHP-MTG6FPIV','PHP-MTQCKHN4','PHP-MTTXJLWR']){
 const r=await fetch(`${url}/rest/v1/wallid_payments?order_id=eq.${id}&select=api_payment_id,status,created_at`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 console.log(id, r.status, await r.text());
}
