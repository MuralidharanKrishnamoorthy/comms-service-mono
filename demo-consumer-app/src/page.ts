import { STORE_NAME } from './store.js'
import { config } from './notifyr.js'

/**
 * The whole storefront UI, served as one document. No build step, no framework
 * — this app exists to show what a *consumer* of Notifyr looks like, and a
 * bundler would only get in the way of reading it.
 *
 * Product art is inline SVG rather than image files: no binaries in the repo,
 * no broken images offline, and the catalogue stays a database concern.
 */
export function page(): string {
  const cfg = config()
  const banner = cfg.configured
    ? ''
    : '<div class="warn"><b>No Notifyr credentials.</b> Set <code>COMMS_BASE_URL</code> and ' +
      '<code>COMMS_API_KEY</code> in <code>demo-consumer-app/.env</code>, then restart.</div>'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${STORE_NAME}</title>
<style>
  :root {
    --canvas:#f6f7f5; --surface:#fff; --sunk:#f2f3f0; --border:#e4e6e1;
    --border-soft:#eef0ec; --ink:#15181d; --muted:#5b6067; --faint:#8d9298;
    --accent:#c4841f; --accent-ink:#8a5c13; --accent-soft:#fdf3e2;
    --success:#1e7a50; --success-soft:#e6f3ec; --danger:#b23a2c; --danger-soft:#fbe6e1;
    --dark:#14161c; --shadow:0 1px 2px rgba(20,22,28,.04), 0 8px 24px rgba(20,22,28,.06);
    --shadow-sm:0 1px 2px rgba(20,22,28,.05);
  }
  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }
  body { margin:0; background:var(--canvas); color:var(--ink);
    font:15px/1.55 "Segoe UI",-apple-system,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased; }

  /* ---- top bar ---- */
  .topbar { background:var(--dark); color:#fff; position:sticky; top:0; z-index:40; }
  .topbar-in { max-width:1240px; margin:0 auto; padding:0 26px; height:62px;
    display:flex; align-items:center; justify-content:space-between; gap:18px; }
  .brand { display:flex; align-items:center; gap:11px; }
  .brand-mark { width:30px; height:30px; border-radius:8px; background:var(--accent);
    display:grid; place-items:center; color:#fff; font-weight:800; font-size:14px; }
  .brand-name { font-size:16px; font-weight:700; letter-spacing:-.1px; }
  .brand-sub { font-size:11px; color:#8d9298; margin-top:-1px; }
  .topbar-right { display:flex; align-items:center; gap:12px; }
  .env { font:11px/1 ui-monospace,Consolas,monospace; color:#9aa0a8;
    background:#1e2128; border:1px solid #262a32; padding:7px 11px; border-radius:999px;
    white-space:nowrap; }
  @media (max-width:760px) { .env { display:none; } }
  .cartbtn { position:relative; background:#1e2128; border:1px solid #2b2f38; color:#e8eaed;
    border-radius:9px; padding:8px 13px; font-size:13px; display:flex; align-items:center; gap:8px; }
  .cartbtn:hover { background:#252932; }
  .cartbtn .count { background:var(--accent); color:#fff; font-size:11px; font-weight:700;
    min-width:19px; height:19px; border-radius:999px; display:grid; place-items:center; padding:0 5px; }

  /* ---- layout ---- */
  main { max-width:1240px; margin:0 auto; padding:26px 26px 70px; }
  .warn { background:#fdf3e0; border:1px solid #ecd7ac; color:#7d5409;
    padding:13px 16px; border-radius:10px; margin-bottom:22px; font-size:13.5px; }
  .cols { display:grid; grid-template-columns:minmax(0,1fr) 396px; gap:24px; align-items:start; }
  @media (max-width:1020px) { .cols { grid-template-columns:1fr; } }

  .section-head { display:flex; align-items:baseline; justify-content:space-between;
    gap:12px; margin:0 0 14px; }
  .section-head h2 { margin:0; font-size:17px; letter-spacing:-.2px; }
  .section-head span { font-size:12.5px; color:var(--faint); }

  /* ---- product grid ---- */
  .products { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  @media (max-width:900px) { .products { grid-template-columns:repeat(2,1fr); } }
  @media (max-width:520px) { .products { grid-template-columns:1fr; } }
  .product { background:var(--surface); border:1px solid var(--border); border-radius:12px;
    overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--shadow-sm);
    transition:box-shadow .16s, transform .16s, border-color .16s; }
  .product:hover { box-shadow:var(--shadow); transform:translateY(-2px);
    border-color:var(--border-soft); }
  .thumb { aspect-ratio:4/3; background:var(--sunk); display:grid; place-items:center;
    border-bottom:1px solid var(--border-soft); }
  .thumb svg { width:58%; height:58%; }
  .product-body { padding:12px 13px 13px; display:flex; flex-direction:column; gap:3px; flex:1; }
  .product .nm { font-size:14px; font-weight:600; line-height:1.3; }
  .product .sku { font:10.5px ui-monospace,Consolas,monospace; color:var(--faint); }
  .product .foot { display:flex; align-items:center; justify-content:space-between;
    gap:9px; margin-top:9px; }
  .product .price { font-size:15px; font-weight:700; letter-spacing:-.2px; }
  .in-cart { font-size:11px; color:var(--accent-ink); background:var(--accent-soft);
    padding:2px 7px; border-radius:999px; font-weight:600; }

  button { font:inherit; cursor:pointer; border-radius:8px; border:1px solid var(--border);
    background:#fff; color:var(--ink); padding:7px 12px; transition:background .14s, border-color .14s; }
  button:hover:not(:disabled) { border-color:var(--faint); }
  button:disabled { opacity:.45; cursor:default; }
  .btn-add { font-size:13px; font-weight:600; padding:6px 13px; }
  .btn-add:hover:not(:disabled) { background:var(--accent-soft); border-color:var(--accent);
    color:var(--accent-ink); }
  .btn-primary { background:var(--accent); border-color:var(--accent); color:#fff;
    font-weight:600; padding:12px 16px; width:100%; font-size:14.5px;
    display:flex; align-items:center; justify-content:center; gap:9px; }
  .btn-primary:hover:not(:disabled) { background:#b3771b; border-color:#b3771b; }
  .btn-ghost { font-size:12.5px; padding:5px 10px; }
  .btn-link { background:none; border:none; color:var(--accent-ink); padding:0;
    font-size:12.5px; text-decoration:underline; }

  /* ---- panel ---- */
  .panel { background:var(--surface); border:1px solid var(--border); border-radius:12px;
    box-shadow:var(--shadow); position:sticky; top:86px; }
  @media (max-width:1020px) { .panel { position:static; } }
  .panel-head { padding:15px 17px 13px; border-bottom:1px solid var(--border-soft); }
  .steps { display:flex; align-items:center; gap:7px; font-size:11.5px; color:var(--faint); }
  .steps .s { display:flex; align-items:center; gap:6px; }
  .steps .dot { width:19px; height:19px; border-radius:999px; background:var(--sunk);
    color:var(--faint); display:grid; place-items:center; font-size:10.5px; font-weight:700; }
  .steps .s.on .dot { background:var(--accent); color:#fff; }
  .steps .s.on { color:var(--ink); font-weight:600; }
  .steps .s.done .dot { background:var(--success-soft); color:var(--success); }
  .steps i { width:14px; height:1px; background:var(--border); display:block; }
  .panel-body { padding:16px 17px; }
  .panel-body + .panel-body { border-top:1px solid var(--border-soft); }

  .lines { display:flex; flex-direction:column; gap:11px; }
  .line { display:flex; gap:11px; align-items:center; }
  .line .ico { width:38px; height:38px; border-radius:8px; background:var(--sunk);
    display:grid; place-items:center; flex:none; }
  .line .ico svg { width:62%; height:62%; }
  .line .info { flex:1; min-width:0; }
  .line .nm { font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis;
    white-space:nowrap; }
  .line .each { font-size:11.5px; color:var(--faint); }
  .qty { display:flex; align-items:center; border:1px solid var(--border); border-radius:7px;
    overflow:hidden; flex:none; }
  .qty button { border:none; border-radius:0; padding:3px 8px; font-size:14px;
    line-height:1; color:var(--muted); background:#fff; }
  .qty button:hover:not(:disabled) { background:var(--sunk); }
  .qty span { min-width:24px; text-align:center; font-size:12.5px; font-weight:600; }
  .line .amt { font-size:13px; font-weight:600; min-width:74px; text-align:right; flex:none; }

  .sums { margin-top:15px; padding-top:13px; border-top:1px dashed var(--border); font-size:13.5px; }
  .sums .r { display:flex; justify-content:space-between; padding:3px 0; color:var(--muted); }
  .sums .r.free { color:var(--success); }
  .sums .grand { display:flex; justify-content:space-between; align-items:baseline;
    margin-top:10px; padding-top:11px; border-top:1px solid var(--ink);
    font-weight:700; font-size:17px; letter-spacing:-.3px; }

  label { display:block; font-size:11.5px; color:var(--muted); margin:13px 0 5px;
    font-weight:600; letter-spacing:.1px; }
  input, select { width:100%; padding:10px 11px; border:1px solid var(--border);
    border-radius:8px; font:inherit; font-size:14px; background:#fff; color:var(--ink);
    transition:border-color .14s, box-shadow .14s; }
  input:focus, select:focus { outline:none; border-color:var(--accent);
    box-shadow:0 0 0 3px rgba(196,132,31,.13); }
  input.bad { border-color:var(--danger); }
  .field-err { color:var(--danger); font-size:11.5px; margin-top:4px; display:none; }
  .field-err.on { display:block; }
  .row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }

  .tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; background:var(--sunk);
    padding:4px; border-radius:9px; }
  .tab { border:none; background:none; border-radius:6px; padding:7px 4px; font-size:12.5px;
    color:var(--muted); font-weight:600; }
  .tab.on { background:#fff; color:var(--ink); box-shadow:var(--shadow-sm); }
  .cardline { position:relative; }
  .cardbrand { position:absolute; right:10px; top:33px; font-size:10.5px; font-weight:700;
    letter-spacing:.4px; color:var(--faint); }
  .hint-note { font-size:11.5px; color:var(--faint); margin-top:7px; line-height:1.45; }
  .lock { display:flex; align-items:center; justify-content:center; gap:6px;
    font-size:11.5px; color:var(--faint); margin-top:11px; }

  .spinner { width:15px; height:15px; border:2px solid rgba(255,255,255,.35);
    border-top-color:#fff; border-radius:999px; animation:spin .6s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }

  /* ---- receipt ---- */
  .receipt-top { display:flex; align-items:center; gap:12px; }
  .tick { width:40px; height:40px; border-radius:999px; display:grid; place-items:center; flex:none; }
  .tick.ok { background:var(--success-soft); color:var(--success); }
  .tick.bad { background:var(--danger-soft); color:var(--danger); }
  .receipt-top h3 { margin:0; font-size:17px; letter-spacing:-.2px; }
  .receipt-top .sub { font-size:12.5px; color:var(--muted); }
  .kv { display:flex; justify-content:space-between; gap:12px; padding:6px 0;
    font-size:13px; border-bottom:1px solid var(--border-soft); }
  .kv:last-child { border-bottom:0; }
  .kv span:first-child { color:var(--muted); }
  .kv .mono { font:12px ui-monospace,Consolas,monospace; }
  .mailed { margin-top:14px; padding:11px 12px; border-radius:9px; font-size:12.5px;
    display:flex; gap:9px; align-items:flex-start; line-height:1.45; }
  .mailed.ok { background:var(--success-soft); color:#15603e; }
  .mailed.bad { background:var(--danger-soft); color:#8d2c21; }
  .mailed svg { flex:none; margin-top:1px; }

  .empty { color:var(--faint); font-size:13px; padding:26px 17px; text-align:center; }

  /* ---- toast ---- */
  #toasts { position:fixed; right:20px; bottom:20px; display:flex; flex-direction:column;
    gap:9px; z-index:90; }
  .toast { background:var(--dark); color:#fff; padding:11px 15px; border-radius:9px;
    font-size:13px; box-shadow:0 8px 26px rgba(0,0,0,.2); max-width:330px;
    animation:rise .22s ease-out; }
  .toast.bad { background:#8d2c21; }
  @keyframes rise { from { opacity:0; transform:translateY(8px); } }
  code { font:12px ui-monospace,Consolas,monospace; background:var(--sunk);
    padding:1px 5px; border-radius:4px; }
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-in">
    <div class="brand">
      <div class="brand-mark">A</div>
      <div>
        <div class="brand-name">${STORE_NAME}</div>
        <div class="brand-sub">Demo consumer app · owns no email code</div>
      </div>
    </div>
    <div class="topbar-right">
      <div class="env">${cfg.baseUrl} · ${cfg.keyPrefix}</div>
      <button class="cartbtn" id="cartBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
        Cart <span class="count" id="cartCount">0</span>
      </button>
    </div>
  </div>
</div>

<main>
  ${banner}
  <div class="cols">
    <div>
      <div class="section-head">
        <h2>Shop</h2>
        <span id="catCount"></span>
      </div>
      <div class="products" id="catalogue"></div>

    </div>

    <div>
      <div class="panel" id="panel">
        <div class="panel-head">
          <div class="steps" id="steps">
            <div class="s on" data-step="1"><span class="dot">1</span>Cart</div><i></i>
            <div class="s" data-step="2"><span class="dot">2</span>Payment</div><i></i>
            <div class="s" data-step="3"><span class="dot">3</span>Invoice</div>
          </div>
        </div>
        <div id="panelContent"></div>
      </div>
    </div>
  </div>
</main>

<div id="toasts"></div>

<script>
var CATALOGUE = [];
var cart = {};
var busy = false;
var view = 'cart';
var lastResult = null;

function money(n) { return Number(n).toFixed(2); }
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
function el(id) { return document.getElementById(id); }

/* Inline product art keyed by sku prefix — no image files, nothing to 404. */
function art(sku) {
  var k = (sku || '').split('-')[1] || '';
  var c = '#8d9298', a = '#c4841f';
  var s = '<svg viewBox="0 0 64 64" fill="none" stroke="' + c +
    '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">';
  if (k === 'MSE') return s + '<rect x="21" y="10" width="22" height="44" rx="11"/><path d="M32 10v14" stroke="' + a + '"/></svg>';
  if (k === 'CBL') return s + '<path d="M14 46c0-12 36-16 36-28"/><rect x="8" y="42" width="12" height="9" rx="2" stroke="' + a + '"/><rect x="44" y="13" width="12" height="9" rx="2"/></svg>';
  if (k === 'KBD') return s + '<rect x="6" y="20" width="52" height="26" rx="4"/><path d="M14 28h4M24 28h4M34 28h4M44 28h4M20 38h24" stroke="' + a + '"/></svg>';
  if (k === 'HUB') return s + '<rect x="8" y="24" width="48" height="16" rx="5"/><path d="M18 32h2M26 32h2M34 32h2M42 32h2" stroke="' + a + '"/><path d="M32 24v-8"/></svg>';
  if (k === 'STD') return s + '<path d="M12 46l14-28h26"/><path d="M20 46h32" stroke="' + a + '"/><rect x="26" y="14" width="28" height="18" rx="2"/></svg>';
  if (k === 'CAM') return s + '<circle cx="32" cy="28" r="14"/><circle cx="32" cy="28" r="5" stroke="' + a + '"/><path d="M20 46h24"/></svg>';
  return s + '<rect x="14" y="14" width="36" height="36" rx="5"/></svg>';
}

function toast(message, bad) {
  var t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = message;
  el('toasts').appendChild(t);
  setTimeout(function () { t.remove(); }, 4200);
}

function cartCount() {
  return Object.keys(cart).reduce(function (n, sku) { return n + cart[sku]; }, 0);
}

function totals() {
  var subtotal = 0;
  Object.keys(cart).forEach(function (sku) {
    var p = product(sku);
    if (p) subtotal += p.price * cart[sku];
  });
  var tax = subtotal * 0.08;
  return { subtotal: subtotal, tax: tax, total: subtotal + tax };
}

function product(sku) {
  return CATALOGUE.filter(function (p) { return p.sku === sku; })[0];
}

function setStep(n) {
  Array.prototype.forEach.call(document.querySelectorAll('#steps .s'), function (s) {
    var i = Number(s.getAttribute('data-step'));
    s.className = 's' + (i === n ? ' on' : (i < n ? ' done' : ''));
  });
}

/* ---------- catalogue ---------- */

function renderCatalogue() {
  el('catCount').textContent = CATALOGUE.length + ' products';
  el('catalogue').innerHTML = CATALOGUE.map(function (p) {
    var n = cart[p.sku] || 0;
    return '<div class="product">' +
      '<div class="thumb">' + art(p.sku) + '</div>' +
      '<div class="product-body">' +
        '<div class="nm">' + esc(p.name) + '</div>' +
        '<div class="sku">' + esc(p.sku) + '</div>' +
        '<div class="foot">' +
          '<span class="price">' + money(p.price) + ' <span style="font-size:11px;color:var(--faint);font-weight:600">USD</span></span>' +
          (n ? '<span class="in-cart">' + n + ' in cart</span>' : '') +
          '<button class="btn-add" data-sku="' + esc(p.sku) + '">Add</button>' +
        '</div>' +
      '</div></div>';
  }).join('');

  Array.prototype.forEach.call(document.querySelectorAll('.btn-add'), function (b) {
    b.onclick = function () { addToCart(b.getAttribute('data-sku')); };
  });
}

function addToCart(sku) {
  cart[sku] = (cart[sku] || 0) + 1;
  if (view !== 'cart') { view = 'cart'; }
  renderCatalogue();
  renderPanel();
  toast(product(sku).name + ' added to cart');
}

function setQty(sku, qty) {
  if (qty <= 0) delete cart[sku]; else cart[sku] = Math.min(qty, 99);
  renderCatalogue();
  renderPanel();
}

/* ---------- panel ---------- */

function renderPanel() {
  el('cartCount').textContent = String(cartCount());
  if (view === 'result') { renderResult(); return; }
  setStep(cartCount() ? 2 : 1);

  var skus = Object.keys(cart);
  if (!skus.length) {
    el('panelContent').innerHTML =
      '<div class="panel-body"><div class="empty" style="padding:30px 0">' +
      'Your cart is empty.<br><span style="font-size:12px">Add something from the shop.</span>' +
      '</div></div>';
    return;
  }

  var t = totals();
  var lines = skus.map(function (sku) {
    var p = product(sku);
    return '<div class="line">' +
      '<div class="ico">' + art(sku) + '</div>' +
      '<div class="info"><div class="nm">' + esc(p.name) + '</div>' +
        '<div class="each">' + money(p.price) + ' each</div></div>' +
      '<div class="qty">' +
        '<button data-dec="' + esc(sku) + '">&minus;</button>' +
        '<span>' + cart[sku] + '</span>' +
        '<button data-inc="' + esc(sku) + '">+</button>' +
      '</div>' +
      '<div class="amt">' + money(p.price * cart[sku]) + '</div>' +
    '</div>';
  }).join('');

  el('panelContent').innerHTML =
    '<div class="panel-body">' +
      '<div class="lines">' + lines + '</div>' +
      '<div class="sums">' +
        '<div class="r"><span>Subtotal</span><span>' + money(t.subtotal) + ' USD</span></div>' +
        '<div class="r"><span>Tax (8%)</span><span>' + money(t.tax) + ' USD</span></div>' +
        '<div class="r free"><span>Shipping</span><span>Free</span></div>' +
        '<div class="grand"><span>Total</span><span>' + money(t.total) + ' USD</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="panel-body">' +
      '<label for="nm">Full name</label>' +
      '<input id="nm" value="Arjun Ramesh" autocomplete="name" />' +
      '<div class="field-err" id="errNm">Enter a name</div>' +
      '<label for="em">Email &mdash; the invoice is sent here</label>' +
      '<input id="em" value="muralidharansrec@gmail.com" autocomplete="email" />' +
      '<div class="field-err" id="errEm">Enter a valid email address</div>' +
    '</div>' +
    '<div class="panel-body">' +
      '<label style="margin-top:0">Payment method</label>' +
      '<div class="tabs" id="tabs">' +
        '<button class="tab on" data-m="card">Card</button>' +
        '<button class="tab" data-m="upi">UPI</button>' +
        '<button class="tab" data-m="netbanking">Net banking</button>' +
      '</div>' +
      '<div id="methodFields"></div>' +
      '<button class="btn-primary" id="pay" style="margin-top:16px">Pay ' + money(t.total) + ' USD</button>' +
      '<div class="lock">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' +
        'Simulated gateway — no real card is charged' +
      '</div>' +
    '</div>';

  Array.prototype.forEach.call(document.querySelectorAll('[data-inc]'), function (b) {
    b.onclick = function () { var s = b.getAttribute('data-inc'); setQty(s, cart[s] + 1); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-dec]'), function (b) {
    b.onclick = function () { var s = b.getAttribute('data-dec'); setQty(s, cart[s] - 1); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab'), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab'), function (x) {
        x.className = 'tab';
      });
      b.className = 'tab on';
      renderMethodFields(b.getAttribute('data-m'));
    };
  });

  renderMethodFields('card');
  el('pay').onclick = pay;
}

function currentMethod() {
  var on = document.querySelector('#tabs .tab.on');
  return on ? on.getAttribute('data-m') : 'card';
}

function renderMethodFields(method) {
  var box = el('methodFields');
  if (method === 'card') {
    box.innerHTML =
      '<div class="cardline">' +
        '<label for="card">Card number</label>' +
        '<input id="card" value="4242 4242 4242 4242" inputmode="numeric" maxlength="23" />' +
        '<span class="cardbrand" id="brand"></span>' +
      '</div>' +
      '<div class="field-err" id="errCard">Enter a 16-digit card number</div>' +
      '<div class="row2">' +
        '<div><label for="exp">Expiry</label><input id="exp" value="12/29" maxlength="5" /></div>' +
        '<div><label for="cvv">CVV</label><input id="cvv" value="123" maxlength="4" inputmode="numeric" /></div>' +
      '</div>' +
      '<div class="hint-note">Test numbers: any card works. Start with <code>4000</code> to force a decline.</div>';
    var input = el('card');
    input.oninput = function () {
      var digits = input.value.replace(/\\D/g, '').slice(0, 16);
      input.value = (digits.match(/.{1,4}/g) || []).join(' ');
      el('brand').textContent =
        digits.charAt(0) === '4' ? 'VISA' :
        digits.charAt(0) === '5' ? 'MASTERCARD' :
        digits.charAt(0) === '3' ? 'AMEX' : '';
    };
    input.oninput();
    el('exp').oninput = function () {
      var d = el('exp').value.replace(/\\D/g, '').slice(0, 4);
      el('exp').value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
    };
  } else if (method === 'upi') {
    box.innerHTML = '<label for="upi">UPI ID</label>' +
      '<input id="upi" value="arjun@okaxis" />' +
      '<div class="hint-note">The simulated gateway approves every UPI collect request.</div>';
  } else {
    box.innerHTML = '<label for="bank">Bank</label>' +
      '<select id="bank"><option>HDFC Bank</option><option>ICICI Bank</option>' +
      '<option>State Bank of India</option><option>Axis Bank</option></select>' +
      '<div class="hint-note">You would be redirected to the bank here. The simulated gateway approves immediately.</div>';
  }
}

/* ---------- payment ---------- */

function showError(inputId, errId, bad) {
  var input = el(inputId), err = el(errId);
  if (!input || !err) return;
  input.className = bad ? 'bad' : '';
  err.className = 'field-err' + (bad ? ' on' : '');
}

function validate() {
  var ok = true;
  var name = el('nm').value.trim();
  var email = el('em').value.trim();
  showError('nm', 'errNm', !name); if (!name) ok = false;
  var emailOk = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email);
  showError('em', 'errEm', !emailOk); if (!emailOk) ok = false;

  if (currentMethod() === 'card') {
    var digits = el('card').value.replace(/\\D/g, '');
    showError('card', 'errCard', digits.length !== 16);
    if (digits.length !== 16) ok = false;
  }
  return ok;
}

function lock(on, text) {
  busy = on;
  var b = el('pay');
  if (!b) return;
  b.disabled = on;
  b.innerHTML = on
    ? '<span class="spinner"></span>' + text
    : 'Pay ' + money(totals().total) + ' USD';
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
}

function pay() {
  if (busy || !validate()) return;
  var lines = Object.keys(cart).map(function (sku) { return { sku: sku, qty: cart[sku] }; });
  var method = currentMethod();

  lock(true, 'Creating order…');
  post('/api/checkout', {
    full_name: el('nm').value,
    email: el('em').value,
    lines: lines
  }).then(function (created) {
    if (!created.ok) throw new Error(created.body.error || 'Checkout failed');
    lock(true, 'Contacting gateway…');
    return post('/api/orders/' + encodeURIComponent(created.body.order.order_no) + '/pay', {
      method: method,
      card_number: method === 'card' && el('card') ? el('card').value : undefined
    });
  }).then(function (res) {
    if (!res.body.order) throw new Error(res.body.error || 'Payment failed');
    lastResult = res.body;
    view = 'result';
    if (res.body.paid) { cart = {}; renderCatalogue(); }
    renderPanel();
    toast(res.body.paid ? 'Payment approved — invoice on its way' : 'Payment declined', !res.body.paid);
  }).catch(function (e) {
    lock(false);
    toast(e.message || String(e), true);
  });
}

/* ---------- result ---------- */

function renderResult() {
  var res = lastResult, o = res.order;
  setStep(3);

  if (!res.paid) {
    el('panelContent').innerHTML =
      '<div class="panel-body">' +
        '<div class="receipt-top"><div class="tick bad">' +
          '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        '</div><div><h3>Payment declined</h3>' +
        '<div class="sub">' + esc(res.payment.failure_reason || 'The gateway refused the payment') + '</div>' +
        '</div></div>' +
        '<div style="margin-top:15px">' +
          '<div class="kv"><span>Order</span><span class="mono">' + esc(o.order_no) + '</span></div>' +
          '<div class="kv"><span>Gateway reference</span><span class="mono">' + esc(res.payment.gateway_ref) + '</span></div>' +
          '<div class="kv"><span>Amount</span><span>' + money(o.total) + ' USD</span></div>' +
        '</div>' +
        '<div class="mailed bad">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v5M12 18h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' +
          'No invoice was sent. Nothing is mailed for a payment that did not settle.' +
        '</div>' +
        '<button class="btn-ghost" id="again" style="margin-top:15px;width:100%">Back to cart</button>' +
      '</div>';
  } else {
    var mailed = o.notification && o.notification.status === 'sent';
    el('panelContent').innerHTML =
      '<div class="panel-body">' +
        '<div class="receipt-top"><div class="tick ok">' +
          '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>' +
        '</div><div><h3>' + money(o.total) + ' USD paid</h3>' +
        '<div class="sub">Invoice ' + esc(o.invoice.number) + '</div></div></div>' +
        '<div style="margin-top:15px">' +
          '<div class="kv"><span>Order</span><span class="mono">' + esc(o.order_no) + '</span></div>' +
          '<div class="kv"><span>Items</span><span>' +
            esc(o.lines.map(function (l) { return l.qty + '× ' + l.name; }).join(', ')) + '</span></div>' +
          '<div class="kv"><span>Subtotal</span><span>' + money(o.subtotal) + ' USD</span></div>' +
          '<div class="kv"><span>Tax</span><span>' + money(o.tax) + ' USD</span></div>' +
          '<div class="kv"><span>Payment reference</span><span class="mono">' + esc(o.payment_ref) + '</span></div>' +
        '</div>' +
        '<div class="mailed ' + (mailed ? 'ok' : 'bad') + '">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>' +
          '<span>' + (mailed
            ? 'Invoice emailed to <b>' + esc(o.customer.email) + '</b> through Notifyr.'
            : 'Payment succeeded, but the invoice email failed: ' +
              esc((o.notification && o.notification.error) || 'unknown') +
              '. The payment stands — the email can be resent.') + '</span>' +
        '</div>' +
        '<button class="btn-primary" id="again" style="margin-top:16px">Start another order</button>' +
      '</div>';
  }

  el('again').onclick = function () {
    view = 'cart';
    lastResult = null;
    renderPanel();
  };
}

el('cartBtn').onclick = function () {
  view = 'cart';
  renderPanel();
  el('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

fetch('/api/products').then(function (r) { return r.json(); }).then(function (products) {
  CATALOGUE = products;
  renderCatalogue();
  renderPanel();
});
</script>
</body>
</html>`
}
