/**
 * PH Labs - Bridge Page v8 "Modern" rebrand
 * Onyx & emerald aesthetic (matches main site). Claims corrected 2026-07-23.
 */

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PH Labs | HPLC-Verified Research Compounds UK</title>
<meta name="description" content="HPLC-verified research compounds with Certificate of Analysis per batch. UK-based, same-day dispatch. Research use only.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#060f1e;
  --bg-elevated:#0b1a30;
  --surface:#0d1d36;
  --text:#f0f4f8;
  --text-dim:#8b9db8;
  --text-muted:#4a5d78;
  --gold:#10b981;
  --gold-bright:#34d399;
  --gold-deep:#059669;
  --blue:#3080ff;
  --hairline:rgba(16,185,129,0.16);
  --hairline-strong:rgba(16,185,129,0.32);
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  font-family:'Inter Tight',system-ui,-apple-system,sans-serif;
  font-weight:300;
  background:var(--bg);color:var(--text);line-height:1.65;
  overflow-x:hidden;-webkit-font-smoothing:antialiased;
}
.container{max-width:1180px;margin:0 auto;padding:0 32px}
::selection{background:var(--gold);color:#060f1e}

/* ========== BACKDROP ========== */
.mesh-bg{
  position:fixed;inset:0;z-index:0;pointer-events:none;
  background:
    radial-gradient(ellipse 60% 45% at 50% 0%,rgba(48,128,255,0.09) 0%,transparent 60%),
    radial-gradient(ellipse 45% 40% at 85% 100%,rgba(16,185,129,0.05) 0%,transparent 55%),
    var(--bg);
}
.noise{
  position:fixed;inset:0;z-index:1;pointer-events:none;opacity:0.025;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat:repeat;background-size:128px;
}

/* ========== AGE GATE ========== */
#age-gate{
  position:fixed;inset:0;background:rgba(4,12,26,0.97);
  z-index:9999;display:flex;align-items:center;justify-content:center;
  backdrop-filter:blur(32px);transition:opacity 0.7s ease;
}
.age-box{
  background:linear-gradient(170deg,#0c1a32,#081426);
  border:1px solid var(--hairline);border-radius:4px;
  padding:72px 60px;max-width:520px;width:90%;text-align:center;
  box-shadow:0 40px 120px rgba(2,8,18,0.8);
  animation:fadeUp 1s cubic-bezier(0.16,1,0.3,1);position:relative;
}
.age-box::before,.age-box::after{
  content:'';position:absolute;width:28px;height:28px;pointer-events:none;
}
.age-box::before{top:10px;left:10px;border-top:1px solid var(--hairline-strong);border-left:1px solid var(--hairline-strong)}
.age-box::after{bottom:10px;right:10px;border-bottom:1px solid var(--hairline-strong);border-right:1px solid var(--hairline-strong)}
.age-box .lock-icon{
  width:64px;height:64px;margin:0 auto 32px;
  border:1px solid var(--hairline-strong);border-radius:50%;
  display:flex;align-items:center;justify-content:center;
}
.age-box .lock-icon svg{width:24px;height:24px;stroke:var(--gold)}
.age-box .eyebrow{
  font-size:11px;letter-spacing:4px;text-transform:uppercase;
  color:var(--gold);margin-bottom:18px;font-weight:500;
}
.age-box h2{
  font-family:'Inter Tight',system-ui,sans-serif;letter-spacing:-0.02em;font-size:34px;
  font-weight:700;margin-bottom:18px;color:var(--text);
}
.age-box .rule{width:48px;height:1px;background:var(--gold-deep);margin:0 auto 24px}
.age-box p{color:var(--text-dim);margin-bottom:40px;font-size:15px;line-height:1.8;font-weight:300}
.age-box .disclaimer{font-size:11px;color:var(--text-muted);margin-top:32px;line-height:1.7;letter-spacing:0.2px}
.age-box .disclaimer strong{color:var(--text-dim);font-weight:500}
.btn{
  display:inline-block;padding:14px 31px;border-radius:11px;
  font-size:11.5px;font-weight:700;cursor:pointer;border:none;
  transition:all 0.3s ease;text-decoration:none;font-family:'Inter Tight',sans-serif;
  letter-spacing:1.2px;text-transform:uppercase;
}
.btn-primary{
  background:linear-gradient(135deg,var(--gold-bright),var(--gold) 60%,var(--gold-deep));
  color:#060f1e;box-shadow:0 10px 30px rgba(16,185,129,0.28),inset 0 1px 0 rgba(255,255,255,0.35);
}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 14px 40px rgba(16,185,129,0.38),inset 0 1px 0 rgba(255,255,255,0.35)}
.btn-outline{
  background:rgba(13,29,54,0.6);color:var(--text-dim);
  border:1px solid rgba(139,157,184,0.25);margin-left:14px;
}
.btn-outline:hover{border-color:var(--gold);color:var(--gold-bright);background:rgba(16,185,129,0.08)}
.age-actions{margin-top:8px}
@keyframes fadeUp{
  from{opacity:0;transform:translateY(24px)}
  to{opacity:1;transform:translateY(0)}
}

/* ========== HEADER ========== */
header{
  position:fixed;top:0;left:0;right:0;z-index:100;
  background:rgba(6,15,30,0.6);
  backdrop-filter:blur(24px) saturate(1.2);
  border-bottom:1px solid rgba(16,185,129,0.08);
}
header .container{display:flex;align-items:center;justify-content:space-between;height:84px}
.logo{display:flex;align-items:center;gap:14px;text-decoration:none}
.logo-img{
  width:42px;height:42px;border-radius:50%;
  object-fit:cover;border:1px solid var(--hairline-strong);
  transition:transform 0.4s;
}
.logo:hover .logo-img{transform:scale(1.06)}
.logo-text{
  font-family:'Inter Tight',system-ui,sans-serif;letter-spacing:-0.02em;font-size:24px;font-weight:700;
  letter-spacing:1px;color:var(--text);white-space:nowrap;
}
.logo-text span{color:var(--gold)}
.nav-links{display:flex;gap:44px;list-style:none}
.nav-links a{
  color:var(--text-dim);text-decoration:none;font-size:12px;font-weight:400;
  letter-spacing:2.5px;text-transform:uppercase;transition:color 0.3s;position:relative;
}
.nav-links a::after{
  content:'';position:absolute;bottom:-6px;left:0;width:0;height:1px;
  background:var(--gold);transition:width 0.35s ease;
}
.nav-links a:hover{color:var(--gold-bright)}
.nav-links a:hover::after{width:100%}
.cta-nav{
  padding:9px 22px;border:1px solid var(--hairline-strong);
  color:var(--gold-bright);border-radius:9px;font-size:10px;font-weight:600;
  letter-spacing:1.5px;text-transform:uppercase;
  text-decoration:none;transition:all 0.3s;background:rgba(16,185,129,0.05);
}
.cta-nav:hover{background:rgba(16,185,129,0.14);border-color:var(--gold)}

/* ========== HERO ========== */
.hero{
  padding:190px 0 130px;position:relative;overflow:hidden;
}
.hero .container{
  position:relative;z-index:3;
  display:grid;grid-template-columns:1.05fr 0.95fr;gap:72px;align-items:center;
}
.hero-copy{max-width:600px}
.sale-pill{
  display:inline-flex;align-items:center;gap:10px;
  padding:9px 20px;border-radius:100px;
  background:rgba(16,185,129,0.08);border:1px solid var(--hairline-strong);
  font-size:11px;color:var(--gold-bright);font-weight:500;
  margin-bottom:34px;letter-spacing:3px;text-transform:uppercase;
  backdrop-filter:blur(10px);
}
.sale-pill .dot{
  width:7px;height:7px;background:var(--gold);border-radius:50%;
  box-shadow:0 0 12px var(--gold);animation:pulse 2s infinite;
}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.45;transform:scale(0.75)}}
.hero h1{
  font-family:'Inter Tight',system-ui,sans-serif;letter-spacing:-0.02em;font-size:76px;
  font-weight:700;line-height:1.05;margin-bottom:26px;
}
.hero h1 .gradient{
  font-style:normal;font-weight:800;
  background:linear-gradient(120deg,var(--gold-bright) 10%,var(--gold) 50%,var(--gold-deep) 90%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.hero p{
  font-size:17px;color:var(--text-dim);max-width:480px;margin-bottom:44px;
  line-height:1.85;font-weight:300;letter-spacing:0.3px;
}
.hero-actions{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.hero-cta{
  padding:16px 36px;
  background:linear-gradient(135deg,var(--gold-bright),var(--gold) 60%,var(--gold-deep));
  color:#060f1e;border-radius:11px;font-size:11.5px;font-weight:700;
  letter-spacing:1.2px;text-transform:uppercase;
  text-decoration:none;display:inline-flex;align-items:center;gap:11px;
  transition:all 0.3s ease;position:relative;overflow:hidden;
  box-shadow:0 12px 36px rgba(16,185,129,0.3),inset 0 1px 0 rgba(255,255,255,0.35);
}
.hero-cta::before{
  content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);
  transition:left 0.6s;
}
.hero-cta:hover::before{left:100%}
.hero-cta:hover{transform:translateY(-2px);box-shadow:0 16px 44px rgba(16,185,129,0.42),inset 0 1px 0 rgba(255,255,255,0.35)}
.hero-cta svg{width:16px;height:16px;stroke:#060f1e}
.code-chip{
  display:inline-flex;align-items:center;gap:9px;cursor:pointer;
  padding:14px 22px;border-radius:11px;border:1px solid var(--hairline-strong);
  background:rgba(13,29,54,0.7);color:var(--gold-bright);
  font-size:11.5px;font-weight:700;letter-spacing:1.5px;
  transition:all 0.3s;font-family:'Inter Tight',sans-serif;
}
.code-chip:hover{background:rgba(16,185,129,0.1);border-color:var(--gold);transform:translateY(-2px)}
.code-chip svg{width:15px;height:15px;stroke:var(--gold)}
.hero-disclaimer{
  margin-top:36px;font-size:11px;color:var(--text-muted);
  letter-spacing:2.5px;text-transform:uppercase;
}
.hero-visual{position:relative}
.hero-visual::before{
  content:'';position:absolute;inset:-8%;z-index:0;
  background:radial-gradient(ellipse at 50% 50%,rgba(16,185,129,0.16) 0%,transparent 65%);
  pointer-events:none;
}
.sale-frame{
  position:relative;z-index:1;border-radius:20px;overflow:hidden;
  border:1px solid var(--hairline);
  box-shadow:0 40px 100px rgba(0,0,0,0.6),0 0 60px rgba(16,185,129,0.08);
  transform:rotate(1.2deg);
  transition:transform 0.6s cubic-bezier(0.16,1,0.3,1);
}
.sale-frame:hover{transform:rotate(0deg) scale(1.01)}
.sale-frame img{display:block;width:100%;height:auto}
.sale-frame::after{
  content:'';position:absolute;inset:0;border-radius:20px;
  box-shadow:inset 0 0 0 1px rgba(52,211,153,0.12);
  pointer-events:none;
}

/* ========== STATS ========== */
.stats{
  display:grid;grid-template-columns:repeat(4,1fr);gap:20px;
  max-width:1180px;margin:0 auto;padding:72px 32px;
  background:var(--bg-elevated);
  border-top:1px solid rgba(16,185,129,0.08);border-bottom:1px solid rgba(16,185,129,0.08);
  position:relative;z-index:2;
}
.stat{
  text-align:center;
  background:rgba(13,29,54,0.55);border:1px solid rgba(16,185,129,0.1);
  border-radius:16px;padding:38px 16px;
  backdrop-filter:blur(8px);
  transition:all 0.4s cubic-bezier(0.16,1,0.3,1);
}
.stat:hover{
  transform:translateY(-4px);border-color:var(--hairline-strong);
  box-shadow:0 20px 50px rgba(2,8,18,0.5);
}
.stat .num{
  font-family:'Inter Tight',system-ui,sans-serif;letter-spacing:-0.02em;font-size:46px;font-weight:400;
  color:var(--gold-bright);line-height:1;
}
.stat .label{
  font-size:10px;color:var(--text-muted);text-transform:uppercase;
  letter-spacing:2.5px;margin-top:14px;font-weight:500;
}

/* ========== FEATURES ========== */
.features{padding:170px 0;position:relative;z-index:2}
.section-eyebrow{
  text-align:center;font-size:11px;letter-spacing:5px;text-transform:uppercase;
  color:var(--gold);margin-bottom:22px;font-weight:500;
}
.section-title{
  font-family:'Inter Tight',system-ui,sans-serif;letter-spacing:-0.02em;text-align:center;
  font-size:54px;font-weight:300;margin-bottom:20px;letter-spacing:0.5px;
}
.section-title em{font-style:italic;color:var(--gold-bright)}
.section-sub{
  text-align:center;color:var(--text-dim);margin-bottom:96px;
  font-size:16px;max-width:560px;margin-left:auto;margin-right:auto;
  font-weight:300;line-height:1.8;
}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.card{
  background:var(--surface);border:1px solid rgba(16,185,129,0.07);
  border-radius:3px;padding:52px 40px;
  transition:all 0.5s cubic-bezier(0.16,1,0.3,1);
  position:relative;overflow:hidden;
}
.card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--gold),transparent);
  opacity:0;transition:opacity 0.5s;
}
.card:hover{
  border-color:var(--hairline);transform:translateY(-6px);
  box-shadow:0 30px 80px rgba(0,0,0,0.55);
}
.card:hover::before{opacity:1}
.card-icon{
  width:56px;height:56px;
  border:1px solid var(--hairline);border-radius:50%;
  display:flex;align-items:center;justify-content:center;margin-bottom:32px;
  transition:all 0.4s;
}
.card-icon svg{width:24px;height:24px;stroke:var(--gold)}
.card:hover .card-icon{border-color:var(--hairline-strong);background:rgba(16,185,129,0.05)}
.card h3{
  font-family:'Inter Tight',system-ui,sans-serif;letter-spacing:-0.02em;font-size:24px;font-weight:500;
  margin-bottom:14px;letter-spacing:0.3px;
}
.card p{font-size:14px;color:var(--text-dim);line-height:1.8;font-weight:300}

/* ========== TRUST ========== */
.trust{
  padding:110px 0;text-align:center;background:var(--bg-elevated);
  border-top:1px solid rgba(16,185,129,0.08);position:relative;z-index:2;
}
.trust h3{
  font-size:11px;text-transform:uppercase;letter-spacing:5px;
  color:var(--gold);margin-bottom:56px;font-weight:500;
}
.trust-logos{
  display:grid;grid-template-columns:repeat(4,1fr);gap:16px;
  max-width:1000px;margin:0 auto;
}
.trust-item{
  display:flex;align-items:center;justify-content:center;gap:10px;
  color:var(--text-dim);font-size:13px;font-weight:500;letter-spacing:0.5px;
  padding:20px 16px;
  background:rgba(13,29,54,0.55);
  border:1px solid rgba(16,185,129,0.1);border-radius:12px;
  backdrop-filter:blur(8px);
  transition:all 0.35s;
}
.trust-item svg{width:16px;height:16px;stroke:var(--gold);flex-shrink:0}
.trust-item:hover{border-color:var(--hairline-strong);color:var(--text);transform:translateY(-3px)}

/* ========== CTA SECTION ========== */
.cta-section{
  padding:180px 0;text-align:center;position:relative;overflow:hidden;z-index:2;
}
.cta-section::before{
  content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  width:640px;height:640px;
  background:radial-gradient(circle,rgba(16,185,129,0.07) 0%,transparent 55%);
  pointer-events:none;
}
.cta-section .container{position:relative;z-index:2}
.cta-section h2{
  font-family:'Inter Tight',system-ui,sans-serif;letter-spacing:-0.02em;font-size:58px;font-weight:300;
  margin-bottom:22px;letter-spacing:0.5px;
}
.cta-section h2 em{font-style:italic;color:var(--gold-bright)}
.cta-section p{
  color:var(--text-dim);margin-bottom:60px;font-size:16px;
  max-width:480px;margin-left:auto;margin-right:auto;font-weight:300;line-height:1.8;
}
.cta-big{
  padding:18px 51px;
  background:linear-gradient(135deg,var(--gold-bright),var(--gold) 60%,var(--gold-deep));
  color:#060f1e;border-radius:11px;font-size:11.5px;font-weight:700;
  letter-spacing:1.5px;text-transform:uppercase;
  text-decoration:none;display:inline-flex;align-items:center;gap:14px;
  transition:all 0.3s ease;position:relative;overflow:hidden;
  box-shadow:0 14px 40px rgba(16,185,129,0.3),inset 0 1px 0 rgba(255,255,255,0.35);
}
.cta-big::before{
  content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);
  transition:left 0.6s;
}
.cta-big:hover::before{left:100%}
.cta-big:hover{transform:translateY(-2px);box-shadow:0 18px 50px rgba(16,185,129,0.42),inset 0 1px 0 rgba(255,255,255,0.35)}
.cta-big svg{width:16px;height:16px}

/* ========== FOOTER ========== */
footer{
  padding:72px 0 48px;border-top:1px solid rgba(16,185,129,0.08);
  text-align:center;background:var(--bg);position:relative;z-index:2;
}
footer .links{display:flex;justify-content:center;gap:40px;margin-bottom:32px}
footer .links a{
  color:var(--text-muted);text-decoration:none;font-size:11px;font-weight:400;
  letter-spacing:2.5px;text-transform:uppercase;transition:color 0.3s;
}
footer .links a:hover{color:var(--gold-bright)}
footer p{
  font-size:12px;color:var(--text-muted);line-height:1.9;
  max-width:720px;margin:0 auto 20px;font-weight:300;
}
.copyright{font-size:11px;color:rgba(107,102,92,0.6);margin-top:12px;letter-spacing:1px}

@media(max-width:900px){
  .hero .container{grid-template-columns:1fr;gap:56px}
  .hero{padding:150px 0 90px}
  .hero-visual{max-width:440px;margin:0 auto}
}
@media(max-width:768px){
  .hero h1{font-size:48px}
  .grid{grid-template-columns:1fr}
  .stats{grid-template-columns:repeat(2,1fr);gap:14px;padding:52px 20px}
  .stat{padding:30px 12px;border-radius:14px}
  .trust-logos{grid-template-columns:repeat(2,1fr);gap:12px}
  .trust-item{padding:16px 10px;font-size:12px}
  .nav-links{display:none}
  .age-box{padding:48px 30px}
  .btn-outline{margin-left:0;margin-top:14px;display:block}
  .section-title{font-size:38px}
  .cta-section h2{font-size:40px}
  .trust-logos{gap:12px}
  .vial-row{display:none}
}

body.gate-active{overflow:hidden}
</style>
</head>
<body class="gate-active">

<div class="mesh-bg"></div>
<div class="noise"></div>

<!-- AGE GATE -->
<div id="age-gate">
  <div class="age-box">
    <div class="lock-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <div class="eyebrow">Private Access</div>
    <h2>Research Access Portal</h2>
    <div class="rule"></div>
    <p>This website contains information intended solely for qualified research professionals, laboratory technicians, and academic institutions.</p>
    <div class="age-actions">
      <button class="btn btn-primary" onclick="enterSite()">I am 18+ &amp; a qualified researcher</button>
      <a href="https://www.google.com" class="btn btn-outline">Leave</a>
    </div>
    <p class="disclaimer">All materials referenced are strictly for <strong>in-vitro research and laboratory use only</strong>. Not for human consumption. By entering you confirm you understand these terms.</p>
  </div>
</div>

<!-- HEADER -->
<header>
  <div class="container">
    <a href="#" class="logo" onclick="event.preventDefault()">
      <img src="__LOGO_DATA_URI__" alt="PH Labs" class="logo-img">
      <span class="logo-text">PH <span>Labs</span></span>
    </a>
    <ul class="nav-links">
      <li><a href="#features">Services</a></li>
      <li><a href="#trust">Trust</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>
    <a href="#" class="cta-nav" onclick="handleCTA(event)">Research Portal &rarr;</a>
  </div>
</header>

<!-- HERO -->
<section class="hero">
  <div class="container">
    <div class="hero-copy">
      <div class="sale-pill"><span class="dot"></span> Flash Sale &middot; Limited Time Offer</div>
      <h1>Advanced<br><span class="gradient">Laboratory Solutions</span></h1>
      <p>HPLC-verified research compounds with full batch documentation and Certificate of Analysis, dispatched from the UK. For qualified researchers and institutions.</p>
      <div class="hero-actions">
        <a href="#" class="hero-cta" onclick="handleCTA(event)">
          Enter Research Portal
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </a>
        <button class="code-chip" onclick="copyCode(this)" type="button">
          CODE: SALE10
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
      <p class="hero-disclaimer">HPLC-verified &middot; CoA per batch &middot; For research use only</p>
    </div>
    <div class="hero-visual">
      <div class="sale-frame">
        <img src="__SALE_IMG_DATA_URI__" alt="Flash Sale — 10% off everything, code SALE10" width="640" height="640">
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats">
  <div class="stat"><div class="num">UK</div><div class="label">Based &amp; Stocked</div></div>
  <div class="stat"><div class="num">&ge;99%</div><div class="label">HPLC Purity</div></div>
  <div class="stat"><div class="num">1&ndash;3d</div><div class="label">UK Delivery</div></div>
  <div class="stat"><div class="num">HPLC</div><div class="label">Batch Verified</div></div>
</section>

<!-- FEATURES -->
<section class="features" id="features">
  <div class="container">
    <div class="section-eyebrow">The PH Labs Standard</div>
    <h2 class="section-title">Why Researchers <em>Choose</em> PH Labs</h2>
    <p class="section-sub">Trusted by researchers, biotech firms, and independent laboratories across the UK.</p>
    <div class="grid">
      <div class="card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6.3L4.7 19a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 9.3V3"/><path d="M7.5 15h9"/></svg>
        </div>
        <h3>Certified Purity</h3>
        <p>Every batch undergoes HPLC and mass spectrometry verification. Certificates of analysis provided with every order.</p>
      </div>
      <div class="card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>
        </div>
        <h3>Discreet &amp; Insured</h3>
        <p>Temperature-controlled packaging, plain exterior labeling, and full transit insurance on all shipments.</p>
      </div>
      <div class="card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M8.5 12.5L7 22l5-3 5 3-1.5-9.5"/></svg>
        </div>
        <h3>Expert Consultation</h3>
        <p>Our technical team provides batch documentation, storage guidance, and compound data on request.</p>
      </div>
      <div class="card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
        </div>
        <h3>Secure Payments</h3>
        <p>PCI-compliant checkout, encrypted data handling, and multiple payment options including bank transfer and card.</p>
      </div>
      <div class="card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
        </div>
        <h3>UK-Based</h3>
        <p>Registered British supplier with local stock. No customs delays — same-day dispatch on UK orders before 1pm.</p>
      </div>
      <div class="card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>
        </div>
        <h3>Full Documentation</h3>
        <p>MSDS sheets, handling protocols, and storage guidelines included. Research-use-only labeling on all materials.</p>
      </div>
    </div>
  </div>
</section>

<!-- TRUST -->
<section class="trust" id="trust">
  <div class="container">
    <h3>Trusted By</h3>
    <div class="trust-logos">
      <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/></svg> UK Universities</div>
      <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v7a8 8 0 0 0 16 0V3"/><path d="M4 3h6"/><path d="M14 3h6"/><path d="M12 18v3"/></svg> Biotech Partners</div>
      <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg> Private Labs</div>
      <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg> Research Institutes</div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section" id="contact">
  <div class="container">
    <div class="section-eyebrow">Begin Your Research</div>
    <h2>Ready to Access Your<br><em>Research Portal?</em></h2>
    <p>Browse our full catalogue of laboratory materials, analytical standards, and research compounds.</p>
    <a href="#" class="cta-big" onclick="handleCTA(event)">
      Enter Research Portal
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
    </a>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="container">
    <div class="links">
      <a href="https://phlabs.co.uk/terms" target="_blank">Terms</a>
      <a href="https://phlabs.co.uk/privacy" target="_blank">Privacy</a>
      <a href="https://phlabs.co.uk/shipping" target="_blank">Shipping</a>
    </div>
    <p>PH Labs Ltd. All products sold on this platform are strictly for in-vitro research and laboratory use only. Not for human consumption, diagnostic, or therapeutic use. Buyers must be 18+ and qualified research professionals. It is the responsibility of the purchaser to ensure compliance with all applicable local laws and regulations.</p>
    <p class="copyright">&copy; 2026 PH Labs. All rights reserved.</p>
  </div>
</footer>

<script>
function enterSite(){
  var gate = document.getElementById('age-gate');
  gate.style.opacity='0';
  setTimeout(function(){
    if(gate) gate.remove();
    document.body.classList.remove('gate-active');
  },500);
  try{localStorage.setItem('phlabs_gate','passed');}catch(e){}
}
try{
  if(localStorage.getItem('phlabs_gate')==='passed'){
    var g = document.getElementById('age-gate');
    if(g) g.remove();
    document.body.classList.remove('gate-active');
  }
}catch(e){}

function handleCTA(e){
  e.preventDefault();
  var url='https://phlabs.co.uk/?utm_source=google&utm_medium=cpc&utm_campaign=bridge_page&utm_content=research_portal';
  window.location.href=url;
}

function copyCode(btn){
  var done=function(){
    var orig=btn.innerHTML;
    btn.innerHTML='COPIED \u2713';
    setTimeout(function(){ btn.innerHTML=orig; },1600);
  };
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText('SALE10').then(done).catch(done);
    }else{
      var t=document.createElement('textarea');
      t.value='SALE10';document.body.appendChild(t);t.select();
      document.execCommand('copy');document.body.removeChild(t);done();
    }
  }catch(e){ done(); }
}
</script>
</body>
</html>`;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Robots-Tag': 'noindex, nofollow',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
  return new Response(HTML_PAGE, { headers });
}
