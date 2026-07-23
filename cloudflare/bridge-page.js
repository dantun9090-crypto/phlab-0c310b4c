/**
 * PH Labs - Bridge Page v8.1 "Modern" rebrand + SALE15 hero image
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
          CODE: SALE15
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
      <p class="hero-disclaimer">HPLC-verified &middot; CoA per batch &middot; For research use only</p>
    </div>
    <div class="hero-visual">
      <div class="sale-frame">
        <img src="data:image/webp;base64,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" alt="Flash Sale — 15% off everything, code SALE15" width="520" height="650">
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
      navigator.clipboard.writeText('SALE15').then(done).catch(done);
    }else{
      var t=document.createElement('textarea');
      t.value='SALE15';document.body.appendChild(t);t.select();
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
