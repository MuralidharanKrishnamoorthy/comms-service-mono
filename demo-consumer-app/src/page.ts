import { CATALOGUE, STORE_NAME } from './store.js'
import { config } from './notifyr.js'

/**
 * The whole storefront UI, served as one document. No build step, no framework
 * — this app exists to show what a *consumer* of Notifyr looks like, and a
 * bundler would only get in the way of reading it.
 */
export function page(): string {
  const cfg = config()
  const banner = cfg.configured
    ? ''
    : '<div class="warn">No Notifyr credentials. Set <code>COMMS_BASE_URL</code> and ' +
      '<code>COMMS_API_KEY</code> in <code>demo-consumer-app/.env</code>, then restart.</div>'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${STORE_NAME} — demo consumer app</title>
<style>
  :root {
    --canvas:#f5f6f4; --surface:#fff; --border:#e1e3de; --ink:#15181d;
    --muted:#5b6067; --faint:#8d9298; --accent:#c4841f; --accent-ink:#8a5c13;
    --accent-soft:#faedd6; --success:#1e7a50; --danger:#b23a2c; --dark:#15181f;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--canvas); color:var(--ink);
    font:15px/1.55 "Segoe UI",system-ui,sans-serif; }
  header { background:var(--dark); color:#fff; padding:18px 28px;
    display:flex; align-items:center; justify-content:space-between; gap:16px; }
  header h1 { margin:0; font-size:19px; letter-spacing:.2px; }
  header .sub { color:#8d9298; font-size:12px; margin-top:2px; }
  .pill { font:12px/1 ui-monospace,Consolas,monospace; background:#22252d;
    color:#d6d9e0; padding:7px 11px; border-radius:999px; }
  main { max-width:1180px; margin:0 auto; padding:24px 28px 60px; }
  .warn { background:#fdf3e0; border:1px solid #e8d3a8; color:#8a5d0c;
    padding:12px 16px; border-radius:8px; margin-bottom:20px; font-size:14px; }
  .cols { display:grid; grid-template-columns:1.25fr .95fr; gap:22px; align-items:start; }
  @media (max-width:900px) { .cols { grid-template-columns:1fr; } }
  .card { background:var(--surface); border:1px solid var(--border);
    border-radius:10px; padding:18px; margin-bottom:20px; }
  .card h2 { margin:0 0 4px; font-size:15px; }
  .card p.hint { margin:0 0 14px; color:var(--faint); font-size:12.5px; }
  .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
  .item { border:1px solid var(--border); border-radius:8px; padding:11px 12px;
    display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .item .nm { font-size:13.5px; font-weight:600; }
  .item .sku { font:11px ui-monospace,Consolas,monospace; color:var(--faint); }
  .item .pr { font-size:13px; color:var(--muted); white-space:nowrap; }
  button { font:inherit; cursor:pointer; border-radius:7px; border:1px solid var(--border);
    background:#fff; color:var(--ink); padding:7px 12px; }
  button:hover:not(:disabled) { border-color:var(--faint); }
  button:disabled { opacity:.5; cursor:default; }
  button.add { padding:5px 11px; font-size:13px; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff;
    font-weight:600; padding:10px 16px; width:100%; }
  button.ghost { font-size:12.5px; padding:5px 10px; }
  label { display:block; font-size:12px; color:var(--muted); margin:12px 0 5px; }
  input { width:100%; padding:9px 11px; border:1px solid var(--border);
    border-radius:7px; font:inherit; background:#fff; }
  table { width:100%; border-collapse:collapse; font-size:13.5px; }
  td { padding:7px 0; border-bottom:1px solid var(--border); }
  td.r { text-align:right; white-space:nowrap; }
  tr:last-child td { border-bottom:0; }
  .total { display:flex; justify-content:space-between; font-weight:700;
    padding-top:11px; margin-top:4px; border-top:2px solid var(--ink); }
  .empty { color:var(--faint); font-size:13px; padding:10px 0; }
  .order { border:1px solid var(--border); border-radius:8px; padding:11px 13px; margin-bottom:9px; }
  .order .top { display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .order .oid { font:12.5px ui-monospace,Consolas,monospace; font-weight:700; }
  .order .who { font-size:12px; color:var(--muted); margin-top:2px; }
  .acts { display:flex; gap:6px; flex-wrap:wrap; margin-top:9px; }
  .flow { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  @media (max-width:900px) { .flow { grid-template-columns:1fr; } }
  .pane h3 { margin:0 0 6px; font-size:12px; text-transform:uppercase;
    letter-spacing:.6px; color:var(--accent-ink); }
  pre { margin:0; background:#f7f8f6; border:1px solid var(--border); border-radius:8px;
    padding:11px; font:11.5px/1.5 ui-monospace,Consolas,monospace; color:#2b2f36;
    overflow:auto; max-height:290px; white-space:pre-wrap; word-break:break-word; }
  .status { display:inline-block; font:11px ui-monospace,Consolas,monospace; font-weight:700;
    padding:3px 9px; border-radius:999px; margin-left:8px; }
  .status.ok { background:#e3f1ea; color:var(--success); }
  .status.bad { background:#f7e0da; color:var(--danger); }
  .foot { color:var(--faint); font-size:12px; margin-top:22px; }
  code { font:12px ui-monospace,Consolas,monospace; background:#eff1ee;
    padding:1px 5px; border-radius:4px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>${STORE_NAME}</h1>
    <div class="sub">A demo app that consumes Notifyr — it owns no email code of its own</div>
  </div>
  <div class="pill">${cfg.baseUrl} · ${cfg.keyPrefix}</div>
</header>

<main>
  ${banner}
  <div class="cols">
    <div>
      <div class="card">
        <h2>Catalogue</h2>
        <p class="hint">Ordinary storefront. Nothing here knows what an email is.</p>
        <div class="grid" id="catalogue"></div>
      </div>

      <div class="card">
        <h2>What just happened</h2>
        <p class="hint">The app's own record, the exact request it sent, and Notifyr's reply.</p>
        <div class="flow">
          <div class="pane"><h3>1 · App's order</h3><pre id="paneOrder">—</pre></div>
          <div class="pane"><h3>2 · Sent to Notifyr</h3><pre id="paneReq">—</pre></div>
          <div class="pane"><h3>3 · Notifyr replied<span id="paneCode"></span></h3><pre id="paneRes">—</pre></div>
        </div>
      </div>
    </div>

    <div>
      <div class="card">
        <h2>Cart</h2>
        <table id="cart"></table>
        <div class="total"><span>Total</span><span id="cartTotal">0.00 USD</span></div>
        <label for="nm">Customer name</label>
        <input id="nm" value="Arjun R." />
        <label for="em">Customer email</label>
        <input id="em" value="muralidharansrec@gmail.com" />
        <div style="margin-top:16px"></div>
        <button class="primary" id="place">Place order &amp; notify</button>
      </div>

      <div class="card">
        <h2>Orders</h2>
        <p class="hint">Each button fires a different template on the same service.</p>
        <div id="orders"><div class="empty">No orders yet.</div></div>
      </div>
    </div>
  </div>

  <div class="foot">
    Every notification above is sent by Notifyr. This app holds one API key and
    calls <code>POST /v1/notifications/send</code>.
  </div>
</main>

<script>
var CATALOGUE = ${JSON.stringify(CATALOGUE)};
var cart = {};
var busy = false;

function money(n) { return n.toFixed(2) + ' USD'; }
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderCatalogue() {
  document.getElementById('catalogue').innerHTML = CATALOGUE.map(function (p) {
    return '<div class="item"><div><div class="nm">' + esc(p.name) + '</div>' +
      '<div class="sku">' + esc(p.sku) + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:9px">' +
      '<span class="pr">' + money(p.price) + '</span>' +
      '<button class="add" data-sku="' + esc(p.sku) + '">Add</button></div></div>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('button.add'), function (b) {
    b.onclick = function () {
      var sku = b.getAttribute('data-sku');
      cart[sku] = (cart[sku] || 0) + 1;
      renderCart();
    };
  });
}

function renderCart() {
  var rows = Object.keys(cart);
  var table = document.getElementById('cart');
  if (rows.length === 0) {
    table.innerHTML = '<tr><td class="empty">Cart is empty — add something.</td></tr>';
    document.getElementById('cartTotal').textContent = money(0);
    return;
  }
  var total = 0;
  table.innerHTML = rows.map(function (sku) {
    var p = CATALOGUE.filter(function (x) { return x.sku === sku; })[0];
    var line = p.price * cart[sku];
    total += line;
    return '<tr><td>' + esc(p.name) + ' <span class="sku">x' + cart[sku] + '</span></td>' +
      '<td class="r">' + money(line) +
      ' <button class="ghost" data-del="' + esc(sku) + '">&times;</button></td></tr>';
  }).join('');
  document.getElementById('cartTotal').textContent = money(total);
  Array.prototype.forEach.call(document.querySelectorAll('button[data-del]'), function (b) {
    b.onclick = function () { delete cart[b.getAttribute('data-del')]; renderCart(); };
  });
}

function showExchange(result) {
  document.getElementById('paneOrder').textContent = JSON.stringify(result.order, null, 2);
  document.getElementById('paneReq').textContent = JSON.stringify(result.notifyr.request, null, 2);
  document.getElementById('paneRes').textContent = JSON.stringify(result.notifyr.body, null, 2);
  var code = document.getElementById('paneCode');
  var status = result.notifyr.status;
  code.className = 'status ' + (result.notifyr.ok ? 'ok' : 'bad');
  code.textContent = status === 0 ? 'unreachable' : String(status);
}

function renderOrders(orders) {
  var box = document.getElementById('orders');
  if (!orders.length) { box.innerHTML = '<div class="empty">No orders yet.</div>'; return; }
  box.innerHTML = orders.map(function (o) {
    var shipped = !!o.shipment;
    return '<div class="order"><div class="top"><div>' +
      '<div class="oid">' + esc(o.order_id) + '</div>' +
      '<div class="who">' + esc(o.customer.full_name) + ' · ' + money(o.total) + '</div>' +
      '</div></div><div class="acts">' +
      '<button class="ghost" data-ship="' + esc(o.order_id) + '" data-ch="email"' +
        (shipped ? ' disabled' : '') + '>Ship &rarr; email</button>' +
      '<button class="ghost" data-ship="' + esc(o.order_id) + '" data-ch="sms"' +
        (shipped ? ' disabled' : '') + '>Ship &rarr; SMS</button>' +
      (shipped ? '<span class="who">' + esc(o.shipment.carrier) + ' · ' +
        esc(o.shipment.tracking_number) + '</span>' : '') +
      '</div></div>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('button[data-ship]'), function (b) {
    b.onclick = function () { ship(b.getAttribute('data-ship'), b.getAttribute('data-ch')); };
  });
}

function lock(on) {
  busy = on;
  document.getElementById('place').disabled = on;
  document.getElementById('place').textContent = on ? 'Sending…' : 'Place order & notify';
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(function (r) { return r.json(); });
}

document.getElementById('place').onclick = function () {
  if (busy) return;
  var lines = Object.keys(cart).map(function (sku) { return { sku: sku, qty: cart[sku] }; });
  if (!lines.length) { alert('Add something to the cart first.'); return; }
  lock(true);
  post('/api/checkout', {
    full_name: document.getElementById('nm').value,
    email: document.getElementById('em').value,
    lines: lines
  }).then(function (res) {
    if (res.error) { alert(res.error); return; }
    cart = {}; renderCart();
    showExchange(res);
    renderOrders(res.orders);
  }).catch(function (e) {
    alert('The storefront itself failed: ' + e);
  }).finally(function () { lock(false); });
};

function ship(orderId, channel) {
  if (busy) return;
  lock(true);
  post('/api/orders/' + encodeURIComponent(orderId) + '/ship', { channel: channel })
    .then(function (res) {
      if (res.error) { alert(res.error); return; }
      showExchange(res);
      renderOrders(res.orders);
    })
    .catch(function (e) { alert('The storefront itself failed: ' + e); })
    .finally(function () { lock(false); });
}

renderCatalogue();
renderCart();
fetch('/api/orders').then(function (r) { return r.json(); }).then(renderOrders);
</script>
</body>
</html>`
}
