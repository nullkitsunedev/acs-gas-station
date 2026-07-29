/* ACS Gas Station — Frontend JS */
const API=''; let currentUser=null;
function getToken(){return localStorage.getItem('hf_token')||getCookie('hf_token');}
function getCookie(n){return(document.cookie.match('(^|;)\\s*'+n+'\\s*=\\s*([^;]+)')||[]).pop()||'';}
function authHeaders(){const t=getToken();return t?{'Content-Type':'application/json','Authorization':'Bearer '+t}:{'Content-Type':'application/json'};}
async function api(method,path,body){
  const opts={method,headers:authHeaders()};
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch(API+path,opts);
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(data.error||r.statusText),{data,status:r.status});
  return data;
}
async function loadUser(){try{const d=await api('GET','/api/auth/me');currentUser=d.user;return d.user;}catch{return null;}}
function requireLogin(r='/login.html'){if(!getToken()){location.href=r;return false;}return true;}
function logout(){
  fetch('/api/auth/logout',{method:'POST',headers:authHeaders()}).finally(()=>{
    localStorage.removeItem('hf_token');
    document.cookie='hf_token=;expires=Thu,01 Jan 1970 00:00:00 GMT;path=/';
    location.href='/login.html';
  });
}
async function renderNav(){
  const user=await loadUser();if(!user)return;
  const rc={customer:'role-customer',attendant:'role-attendant',manager:'role-manager',director:'role-director',admin:'role-admin'}[user.role]||'role-customer';
  const links={
    customer: `<a href="/dashboard.html">Dashboard</a><a href="/transactions.html">Transactions</a><a href="/loyalty.html">Loyalty</a><a href="/deliveries.html">Deliveries</a><a href="/reports.html">Reports</a><a href="/profile.html">Profile</a>`,
    attendant:`<a href="/dashboard.html">Dashboard</a><a href="/transactions.html">Transactions</a><a href="/manager.html">Station</a><a href="/reports.html">Reports</a>`,
    manager:  `<a href="/dashboard.html">Dashboard</a><a href="/transactions.html">Transactions</a><a href="/manager.html">Manager</a><a href="/deliveries.html">Deliveries</a><a href="/reports.html">Reports</a>`,
    director: `<a href="/dashboard.html">Dashboard</a><a href="/manager.html">Station</a><a href="/reports.html">Reports</a><a href="/admin.html" class="admin-link">Admin</a>`,
    admin:    `<a href="/dashboard.html">Dashboard</a><a href="/manager.html">Station</a><a href="/deliveries.html">Deliveries</a><a href="/reports.html">Reports</a><a href="/admin.html" class="admin-link">Admin</a>`,
  };
  document.querySelector('nav').innerHTML=`
    <a class="nav-brand" href="/dashboard.html">
      <div class="nav-icon">⛽</div>
      <div class="nav-brand-text"><span class="name">ACS Gas Station</span><span class="sub">Arena Web Security Energy</span></div>
    </a>
    <div class="nav-links">${links[user.role]||links.customer}</div>
    <div class="nav-user">
      <span class="role-badge ${rc}">${user.role}</span>
      <button class="btn btn-sm" style="background:rgba(10,110,36,.4);color:#fff;border:1px solid rgba(10,110,36,.5)" onclick="logout()">Sign Out</button>
    </div>`;
  document.querySelectorAll('.nav-links a').forEach(a=>{if(a.href===location.href)a.classList.add('active');});
}
function statusBadge(s){const m={active:'badge-green',completed:'badge-grey',scheduled:'badge-green',cancelled:'badge-red',card:'badge-black',cash:'badge-orange'};return`<span class="badge ${m[s]||'badge-grey'}">${s}</span>`;}
function fmtDate(d){if(!d)return'—';return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
function fmtDateTime(d){if(!d)return'—';return new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function fmtCurrency(n){return'GHS '+parseFloat(n||0).toFixed(2);}
function toast(msg,type='green'){const d=document.createElement('div');d.className=`alert alert-${type}`;d.style.cssText='position:fixed;top:74px;right:20px;z-index:9999;max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.2)';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),4000);}
function $(id){return document.getElementById(id);}
