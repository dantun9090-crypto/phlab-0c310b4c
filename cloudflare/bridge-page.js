/**
 * PH Labs - Bridge Page v7 "Maison" luxury redesign
 * Onyx & champagne aesthetic. Copy unchanged from v6 (compliance).
 */

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PH Labs | Advanced Research Solutions</title>
<meta name="description" content="Premium laboratory research materials for qualified professionals. UK-based, ISO certified.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0a0a0c;
  --bg-elevated:#0e0e11;
  --surface:#111114;
  --text:#ece7dd;
  --text-dim:#a39d90;
  --text-muted:#6b665c;
  --gold:#c8a96a;
  --gold-bright:#e8d5a8;
  --gold-deep:#8a6f3e;
  --hairline:rgba(200,169,106,0.16);
  --hairline-strong:rgba(200,169,106,0.32);
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
::selection{background:var(--gold);color:#0a0a0c}

/* ========== BACKDROP ========== */
.mesh-bg{
  position:fixed;inset:0;z-index:0;pointer-events:none;
  background:
    radial-gradient(ellipse 60% 45% at 50% 0%,rgba(200,169,106,0.07) 0%,transparent 60%),
    radial-gradient(ellipse 45% 40% at 85% 100%,rgba(200,169,106,0.04) 0%,transparent 55%),
    var(--bg);
}
.noise{
  position:fixed;inset:0;z-index:1;pointer-events:none;opacity:0.025;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat:repeat;background-size:128px;
}

/* ========== AGE GATE ========== */
#age-gate{
  position:fixed;inset:0;background:rgba(8,8,10,0.97);
  z-index:9999;display:flex;align-items:center;justify-content:center;
  backdrop-filter:blur(32px);transition:opacity 0.7s ease;
}
.age-box{
  background:linear-gradient(170deg,#121215,#0c0c0f);
  border:1px solid var(--hairline);border-radius:4px;
  padding:72px 60px;max-width:520px;width:90%;text-align:center;
  box-shadow:0 40px 120px rgba(0,0,0,0.7);
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
  font-family:'Cormorant Garamond',Georgia,serif;font-size:38px;
  font-weight:400;margin-bottom:18px;letter-spacing:0.5px;color:var(--text);
}
.age-box .rule{width:48px;height:1px;background:var(--gold-deep);margin:0 auto 24px}
.age-box p{color:var(--text-dim);margin-bottom:40px;font-size:15px;line-height:1.8;font-weight:300}
.age-box .disclaimer{font-size:11px;color:var(--text-muted);margin-top:32px;line-height:1.7;letter-spacing:0.2px}
.age-box .disclaimer strong{color:var(--text-dim);font-weight:500}
.btn{
  display:inline-block;padding:15px 36px;border-radius:2px;
  font-size:13px;font-weight:500;cursor:pointer;border:none;
  transition:all 0.35s ease;text-decoration:none;font-family:'Inter Tight',sans-serif;
  letter-spacing:2px;text-transform:uppercase;
}
.btn-primary{
  background:linear-gradient(135deg,var(--gold-bright),var(--gold) 55%,var(--gold-deep));
  color:#0a0a0c;
}
.btn-primary:hover{filter:brightness(1.1);transform:translateY(-1px)}
.btn-outline{
  background:transparent;color:var(--text-dim);
  border:1px solid rgba(163,157,144,0.25);margin-left:14px;
}
.btn-outline:hover{border-color:var(--gold);color:var(--gold-bright)}
.age-actions{margin-top:8px}
@keyframes fadeUp{
  from{opacity:0;transform:translateY(24px)}
  to{opacity:1;transform:translateY(0)}
}

/* ========== HEADER ========== */
header{
  position:fixed;top:0;left:0;right:0;z-index:100;
  background:rgba(10,10,12,0.55);
  backdrop-filter:blur(24px) saturate(1.2);
  border-bottom:1px solid rgba(200,169,106,0.08);
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
  font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:500;
  letter-spacing:1px;color:var(--text);white-space:nowrap;
}
.logo-text span{color:var(--gold);font-style:italic}
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
  padding:11px 28px;border:1px solid var(--hairline-strong);
  color:var(--gold-bright);border-radius:2px;font-size:11px;font-weight:500;
  letter-spacing:2px;text-transform:uppercase;
  text-decoration:none;transition:all 0.35s;
}
.cta-nav:hover{background:rgba(200,169,106,0.08);border-color:var(--gold)}

/* ========== HERO ========== */
.hero{
  padding:260px 0 200px;text-align:center;position:relative;overflow:hidden;
}
.hero .container{position:relative;z-index:3}

.vial-row{
  position:absolute;bottom:0;left:50%;transform:translateX(-50%);
  display:flex;align-items:flex-end;gap:22px;z-index:2;opacity:0.5;
  pointer-events:none;
}
.vial{
  position:relative;width:50px;border-radius:24px 24px 6px 6px;
  background:linear-gradient(180deg,rgba(200,169,106,0.05),rgba(138,111,62,0.12));
  border:1px solid rgba(200,169,106,0.14);overflow:hidden;
  box-shadow:inset 0 8px 16px rgba(255,255,255,0.03);
}
.vial::before{
  content:'';position:absolute;top:-12px;left:50%;transform:translateX(-50%);
  width:30px;height:12px;background:linear-gradient(180deg,rgba(200,169,106,0.35),rgba(138,111,62,0.25));
  border-radius:6px 6px 2px 2px;border:1px solid rgba(200,169,106,0.25);
}
.vial::after{
  content:'';position:absolute;top:18px;left:6px;right:6px;bottom:8px;
  background:linear-gradient(180deg,rgba(232,213,168,0.16),rgba(200,169,106,0.04));
  border-radius:16px;
  animation:liquidWave 5s ease-in-out infinite;
}
@keyframes liquidWave{
  0%,100%{transform:translateY(0)}
  50%{transform:translateY(-4px)}
}
.vial:nth-child(1){height:120px;transform:rotate(-5deg);margin-bottom:12px}
.vial:nth-child(2){height:170px;transform:rotate(2deg);margin-bottom:6px}
.vial:nth-child(3){height:210px;opacity:0.95}
.vial:nth-child(4){height:160px;transform:rotate(-2deg);margin-bottom:9px}
.vial:nth-child(5){height:140px;transform:rotate(4deg);margin-bottom:14px}
.vial:nth-child(6){height:105px;transform:rotate(-3deg);margin-bottom:18px;opacity:0.7}

.hero-badge{
  display:inline-flex;align-items:center;gap:14px;
  font-size:11px;color:var(--gold);font-weight:500;
  margin-bottom:44px;letter-spacing:5px;text-transform:uppercase;
}
.hero-badge::before,.hero-badge::after{
  content:'';width:56px;height:1px;background:linear-gradient(90deg,transparent,var(--gold-deep));
}
.hero-badge::after{background:linear-gradient(90deg,var(--gold-deep),transparent)}

.hero h1{
  font-family:'Cormorant Garamond',Georgia,serif;font-size:92px;
  font-weight:300;line-height:1.04;margin-bottom:28px;letter-spacing:0.5px;
}
.hero h1 .gradient{
  font-style:italic;font-weight:400;
  background:linear-gradient(120deg,var(--gold-bright) 10%,var(--gold) 50%,var(--gold-deep) 90%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.hero p{
  font-size:17px;color:var(--text-dim);max-width:540px;margin:0 auto 52px;
  line-height:1.85;font-weight:300;letter-spacing:0.3px;
}
.hero-cta{
  padding:19px 54px;
  background:linear-gradient(135deg,var(--gold-bright),var(--gold) 55%,var(--gold-deep));
  color:#0a0a0c;border-radius:2px;font-size:13px;font-weight:600;
  letter-spacing:2.5px;text-transform:uppercase;
  text-decoration:none;display:inline-flex;align-items:center;gap:14px;
  transition:all 0.4s ease;position:relative;overflow:hidden;
}
.hero-cta::before{
  content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);
  transition:left 0.6s;
}
.hero-cta:hover::before{left:100%}
.hero-cta:hover{transform:translateY(-2px);filter:brightness(1.06)}
.hero-cta svg{width:16px;height:16px;stroke:#0a0a0c}
.hero-disclaimer{
  margin-top:40px;font-size:11px;color:var(--text-muted);
  letter-spacing:2.5px;text-transform:uppercase;
}

/* ========== STATS ========== */
.stats{
  display:flex;justify-content:center;
  padding:0;background:var(--bg-elevated);
  border-top:1px solid rgba(200,169,106,0.08);border-bottom:1px solid rgba(200,169,106,0.08);
  position:relative;z-index:2;
}
.stat{
  text-align:center;padding:72px 0;flex:1;max-width:240px;
}
.stat + .stat{border-left:1px solid rgba(200,169,106,0.08)}
.stat .num{
  font-family:'Cormorant Garamond',serif;font-size:56px;font-weight:400;
  color:var(--gold-bright);line-height:1;
}
.stat .label{
  font-size:11px;color:var(--text-muted);text-transform:uppercase;
  letter-spacing:3px;margin-top:18px;font-weight:400;
}

/* ========== FEATURES ========== */
.features{padding:170px 0;position:relative;z-index:2}
.section-eyebrow{
  text-align:center;font-size:11px;letter-spacing:5px;text-transform:uppercase;
  color:var(--gold);margin-bottom:22px;font-weight:500;
}
.section-title{
  font-family:'Cormorant Garamond',serif;text-align:center;
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
  background:var(--surface);border:1px solid rgba(200,169,106,0.07);
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
.card:hover .card-icon{border-color:var(--hairline-strong);background:rgba(200,169,106,0.05)}
.card h3{
  font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:500;
  margin-bottom:14px;letter-spacing:0.3px;
}
.card p{font-size:14px;color:var(--text-dim);line-height:1.8;font-weight:300}

/* ========== TRUST ========== */
.trust{
  padding:110px 0;text-align:center;background:var(--bg-elevated);
  border-top:1px solid rgba(200,169,106,0.08);position:relative;z-index:2;
}
.trust h3{
  font-size:11px;text-transform:uppercase;letter-spacing:5px;
  color:var(--gold);margin-bottom:56px;font-weight:500;
}
.trust-logos{
  display:flex;justify-content:center;align-items:center;gap:24px;flex-wrap:wrap;
}
.trust-item{
  display:flex;align-items:center;gap:12px;
  color:var(--text-dim);font-size:13px;font-weight:400;letter-spacing:1px;
  padding:16px 32px;
  border:1px solid rgba(200,169,106,0.1);border-radius:2px;
  transition:all 0.35s;
}
.trust-item svg{width:16px;height:16px;stroke:var(--gold)}
.trust-item:hover{border-color:var(--hairline-strong);color:var(--text)}

/* ========== CTA SECTION ========== */
.cta-section{
  padding:180px 0;text-align:center;position:relative;overflow:hidden;z-index:2;
}
.cta-section::before{
  content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  width:640px;height:640px;
  background:radial-gradient(circle,rgba(200,169,106,0.06) 0%,transparent 55%);
  pointer-events:none;
}
.cta-section .container{position:relative;z-index:2}
.cta-section h2{
  font-family:'Cormorant Garamond',serif;font-size:58px;font-weight:300;
  margin-bottom:22px;letter-spacing:0.5px;
}
.cta-section h2 em{font-style:italic;color:var(--gold-bright)}
.cta-section p{
  color:var(--text-dim);margin-bottom:60px;font-size:16px;
  max-width:480px;margin-left:auto;margin-right:auto;font-weight:300;line-height:1.8;
}
.cta-big{
  padding:21px 60px;
  background:linear-gradient(135deg,var(--gold-bright),var(--gold) 55%,var(--gold-deep));
  color:#0a0a0c;border-radius:2px;font-size:13px;font-weight:600;
  letter-spacing:2.5px;text-transform:uppercase;
  text-decoration:none;display:inline-flex;align-items:center;gap:16px;
  transition:all 0.4s ease;position:relative;overflow:hidden;
}
.cta-big::before{
  content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);
  transition:left 0.6s;
}
.cta-big:hover::before{left:100%}
.cta-big:hover{transform:translateY(-2px);filter:brightness(1.06)}
.cta-big svg{width:16px;height:16px}

/* ========== FOOTER ========== */
footer{
  padding:72px 0 48px;border-top:1px solid rgba(200,169,106,0.08);
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

@media(max-width:768px){
  .hero h1{font-size:52px}
  .grid{grid-template-columns:1fr}
  .stats{flex-wrap:wrap}
  .stat{flex:1 1 40%;padding:44px 0}
  .stat + .stat{border-left:none}
  .nav-links{display:none}
  .age-box{padding:48px 30px}
  .btn-outline{margin-left:0;margin-top:14px;display:block}
  .section-title{font-size:38px}
  .cta-section h2{font-size:40px}
  .trust-logos{gap:12px}
  .hero{padding:170px 0 110px}
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
  <div class="vial-row">
    <div class="vial"></div>
    <div class="vial"></div>
    <div class="vial"></div>
    <div class="vial"></div>
    <div class="vial"></div>
    <div class="vial"></div>
  </div>
  <div class="container">
    <div class="hero-badge">Limited Time Offer</div>
    <h1>Advanced<br><span class="gradient">Laboratory Solutions</span></h1>
    <p>Premium analytical instruments, certified reference materials, and research-grade compounds for institutions and professionals worldwide.</p>
    <a href="#" class="hero-cta" onclick="handleCTA(event)">
      Enter Research Portal
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
    </a>
    <p class="hero-disclaimer">HPLC-verified &middot; CoA per batch &middot; For research use only</p>
  </div>
</section>

<!-- STATS -->
<section class="stats">
  <div class="stat"><div class="num">50+</div><div class="label">Countries Served</div></div>
  <div class="stat"><div class="num">99.7%</div><div class="label">Purity Standard</div></div>
  <div class="stat"><div class="num">24h</div><div class="label">Dispatch Time</div></div>
  <div class="stat"><div class="num">ISO</div><div class="label">Certified</div></div>
</section>

<!-- FEATURES -->
<section class="features" id="features">
  <div class="container">
    <div class="section-eyebrow">The PH Labs Standard</div>
    <h2 class="section-title">Why Researchers <em>Choose</em> PH Labs</h2>
    <p class="section-sub">Trusted by universities, biotech firms, and independent laboratories across the UK and EU.</p>
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
        <p>Our in-house PhD chemists provide protocol guidance, compound selection advice, and technical documentation.</p>
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
        <p>Registered British laboratory with local stock. No customs delays for UK customers. EU shipping available.</p>
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
