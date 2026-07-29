'use strict';

// ════════════════════════════════════════════════════════════════
//  Arena Web Security — ACS Gas Station  v1.0.0
//  Property of Arena Web Security
//
//  [V1]  Mass Assignment              POST /api/auth/register
//  [V2]  IDOR — Transaction History   GET  /api/transactions/:id
//  [V3]  JWT Forgery (weak secret)    All endpoints — secret via SSRF/LFI
//  [V4]  Blind SQL Injection          GET  /api/fuel/search?type=
//  [V5]  SSRF — Price Feed URL        POST /api/fuel/external-price
//  [V6]  Price Tampering (BOPLA)      POST /api/transactions (client price trusted)
//  [V7]  Race Condition               POST /api/loyalty/redeem
//  [V8]  XXE — Delivery Manifest      POST /api/deliveries/upload
//  [V9]  LFI — Report Template        GET  /api/reports/generate?template=
//  [V10] Insecure File Upload → RCE   POST /api/upload/receipt
//  [V11] Broken Access Control        GET  /api/manager/dashboard
//  [V12] Chain: SSRF→JWT→Upload→RCE   Full kill chain
// ════════════════════════════════════════════════════════════════

const express      = require('express');
const sqlite3      = require('sqlite3').verbose();
const jwt          = require('jsonwebtoken');
const multer       = require('multer');
const cookieParser = require('cookie-parser');
const fetch        = require('node-fetch');
const xml2js       = require('xml2js');
const path         = require('path');
const fs           = require('fs');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = 3000;

// [V3] Weak JWT secret — discoverable via SSRF or LFI
const JWT_SECRET = 'acs-gas-station2025';

const DB_PATH = path.join(__dirname, 'data', 'fuel.db');
const UPLOADS  = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive:true });

const db = new sqlite3.Database(DB_PATH);
const dbGet = (s,p=[]) => new Promise((r,j)=>db.get(s,p,(e,row)=>e?j(e):r(row)));
const dbAll = (s,p=[]) => new Promise((r,j)=>db.all(s,p,(e,rows)=>e?j(e):r(rows)));
const dbRun = (s,p=[]) => new Promise((r,j)=>db.run(s,p,function(e){e?j(e):r(this);}));

app.use(express.json({limit:'5mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.text({type:'application/xml',limit:'1mb'}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,'public')));

function requireAuth(req,res,next){
  const h=req.headers['authorization']||'';
  const token=h.startsWith('Bearer ')?h.slice(7):req.cookies['hf_token'];
  if(!token)return res.status(401).json({error:'Authentication required'});
  try{req.user=jwt.verify(token,JWT_SECRET);next();}
  catch(e){res.status(401).json({error:'Invalid or expired token'});}
}

function requireRole(...roles){
  return(req,res,next)=>requireAuth(req,res,()=>{
    if(!roles.includes(req.user.role))return res.status(403).json({error:'Access denied'});
    next();
  });
}

function log(uid,action,details,ip){
  dbRun('INSERT INTO audit_logs (user_id,action,details,ip_address) VALUES (?,?,?,?)',[uid,action,details,ip||'unknown']).catch(()=>{});
}

app.get('/',(_,res)=>res.redirect('/login.html'));

// ════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════

// [V1] MASS ASSIGNMENT — role, loyalty_points, card_number accepted from body
app.post('/api/auth/register',async(req,res)=>{
  try{
    const{email,password,name,phone,vehicle_plate}=req.body;
    if(!email||!password||!name)return res.status(400).json({error:'email, password, name required'});
    const exists=await dbGet('SELECT id FROM users WHERE email=?',[email]);
    if(exists)return res.status(409).json({error:'Email already registered'});

    // [V1] role and loyalty_points trusted from body
    const role=req.body.role||'customer';
    const loyalty_points=req.body.loyalty_points||0;
    const card_number=req.body.card_number||`4000-${Math.floor(Math.random()*9000+1000)}-${Math.floor(Math.random()*9000+1000)}-${Math.floor(Math.random()*9000+1000)}`;

    const count=await dbGet('SELECT COUNT(*) as c FROM users');
    const customer_id=`ACS-CST-${String((count?.c||0)+1).padStart(3,'0')}`;
    await dbRun(
      `INSERT INTO users (uuid,customer_id,email,password,name,role,phone,loyalty_points,card_number,vehicle_plate) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(),customer_id,email,password,name,role,phone||'',loyalty_points,card_number,vehicle_plate||'']
    );
    
    log(null,'REGISTER',`New user: ${email} role=${role}`,req.ip);
    res.json({success:true,customer_id});
  }catch(e){res.status(500).json({error:e.message});}
});

// [V1] No rate limiting
app.post('/api/auth/login',async(req,res)=>{
  try{
    const{email,password}=req.body;
    const user=await dbGet('SELECT * FROM users WHERE email=? AND password=?',[email,password]);
    if(!user)return res.status(401).json({error:'Invalid credentials'});
    const token=jwt.sign(
      {userId:user.id,uuid:user.uuid,customer_id:user.customer_id,email:user.email,name:user.name,role:user.role},
      JWT_SECRET,{expiresIn:'24h'}
    );
    res.cookie('hf_token',token,{httpOnly:false}); // [V3] httpOnly false
    log(user.id,'LOGIN',`${user.email} logged in`,req.ip);
    res.json({success:true,token,user:{id:user.id,uuid:user.uuid,customer_id:user.customer_id,email:user.email,name:user.name,role:user.role,loyalty_points:user.loyalty_points}});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/auth/logout',(req,res)=>{res.clearCookie('hf_token');res.json({success:true});});

app.get('/api/auth/me',requireAuth,async(req,res)=>{
  try{
    const u=await dbGet('SELECT id,uuid,customer_id,email,name,role,phone,loyalty_points,card_number,vehicle_plate,station_id,created_at FROM users WHERE id=?',[req.user.userId]);
    res.json({user:u});
  }catch(e){res.status(500).json({error:e.message});}
});

// ════════════════════════════════════════════════════════════════
// TRANSACTIONS — [V2] IDOR + [V6] Price Tampering
// ════════════════════════════════════════════════════════════════

app.get('/api/transactions/my',requireAuth,async(req,res)=>{
  try{
    const txns=await dbAll('SELECT * FROM transactions WHERE customer_id=? ORDER BY created_at DESC',[req.user.userId]);
    res.json({transactions:txns});
  }catch(e){res.status(500).json({error:e.message});}
});

// [V2] IDOR — any customer reads any transaction (card numbers exposed)
app.get('/api/transactions/:id',requireAuth,async(req,res)=>{
  try{
    const txn=await dbGet(
      `SELECT t.*,u.name as customer_name,u.customer_id as cust_id,u.email as customer_email,
              u.card_number,u.vehicle_plate,u.phone as customer_phone,u.loyalty_points
       FROM transactions t JOIN users u ON u.id=t.customer_id WHERE t.id=?`,
      [req.params.id]
    );
    if(!txn)return res.status(404).json({error:'Transaction not found'});
    
    res.json({transaction:txn});
  }catch(e){res.status(500).json({error:e.message});}
});

// [V6] BOPLA — price_per_litre trusted from client
app.post('/api/transactions',requireAuth,async(req,res)=>{
  try{
    const{pump_number,fuel_type,litres,payment_method}=req.body;
    if(!pump_number||!fuel_type||!litres)return res.status(400).json({error:'pump_number, fuel_type, litres required'});
    const inventory=await dbGet('SELECT price_per_litre FROM fuel_inventory WHERE fuel_type=?',[fuel_type]);
    if(!inventory)return res.status(404).json({error:'Fuel type not found'});
    // [V6] client-supplied price_per_litre trusted over DB value
    const price=parseFloat(req.body.price_per_litre)||inventory.price_per_litre;
    const total=parseFloat(litres)*price;
    const loyalty=Math.floor(litres);
    await dbRun(
      `INSERT INTO transactions (uuid,customer_id,pump_number,fuel_type,litres,price_per_litre,total,payment_method,loyalty_earned) VALUES (?,?,?,?,?,?,?,?,?)`,
      [uuidv4(),req.user.userId,pump_number,fuel_type,litres,price,total,payment_method||'card',loyalty]
    );
    await dbRun('UPDATE users SET loyalty_points=loyalty_points+? WHERE id=?',[loyalty,req.user.userId]);
    
    log(req.user.userId,'TRANSACTION',`${litres}L ${fuel_type} @${price}/L = BDT${total}`,req.ip);
    res.json({success:true,total,loyalty_earned:loyalty});
  }catch(e){res.status(500).json({error:e.message});}
});

// ════════════════════════════════════════════════════════════════
// FUEL — [V4] Blind SQLi + prices
// ════════════════════════════════════════════════════════════════

app.get('/api/fuel',async(_,res)=>{
  try{
    const fuels=await dbAll('SELECT fuel_type,price_per_litre,current_level,tank_capacity FROM fuel_inventory ORDER BY fuel_type');
    res.json({fuels});
  }catch(e){res.status(500).json({error:e.message});}
});

// [V4] BLIND SQL INJECTION — no error messages returned, time-based only
app.get('/api/fuel/search',requireAuth,async(req,res)=>{
  const type=req.query.type||'';
  try{
    const rows=await new Promise((resolve,reject)=>{
      db.all(
        `SELECT fuel_type,price_per_litre,current_level FROM fuel_inventory WHERE fuel_type LIKE '%${type}%'`,
        (err,rows)=>err?reject(err):resolve(rows)
      );
    });
    res.json({fuels:rows});
  }catch(e){
    // [V4] Error suppressed — blind injection only
    res.json({fuels:[],message:'No results found'});
  }
});

// [V5] SSRF — server fetches attacker-supplied price feed URL
app.post('/api/fuel/external-price',requireAuth,async(req,res)=>{
  const{url}=req.body;
  if(!url)return res.status(400).json({error:'url required'});
  try{
    const response=await fetch(url,{timeout:5000});
    const text=await response.text();
    log(req.user.userId,'PRICE_FEED',`Fetched: ${url}`,req.ip);
    const hasSecret=text.includes('JWT_SECRET');
    res.json({success:true,status:response.status,data:text.slice(0,3000),
      ...(hasSecret&&{note:'Internal service reached via SSRF.'})});
  }catch(e){res.status(500).json({error:e.message,url});}
});

// ════════════════════════════════════════════════════════════════
// LOYALTY — [V7] Race Condition
// ════════════════════════════════════════════════════════════════

// [V7] RACE CONDITION — 250ms TOCTOU window between check and update
app.post('/api/loyalty/redeem',requireAuth,async(req,res)=>{
  try{
    const{points}=req.body;
    const pts=parseInt(points)||100;
    const user=await dbGet('SELECT * FROM users WHERE id=?',[req.user.userId]);
    if(!user)return res.status(404).json({error:'User not found'});
    if(user.loyalty_points<pts)return res.status(400).json({error:`Insufficient points. You have ${user.loyalty_points}`});

    // [V7] 250ms delay — race condition window
    await new Promise(r=>setTimeout(r,250));

    const discount=pts*0.05;
    await dbRun('UPDATE users SET loyalty_points=loyalty_points-? WHERE id=?',[pts,req.user.userId]);
    await dbRun('INSERT INTO loyalty_redemptions (customer_id,points_used,discount_bdt) VALUES (?,?,?)',[req.user.userId,pts,discount]);

    const updatedUser=await dbGet('SELECT loyalty_points FROM users WHERE id=?',[req.user.userId]);
    const raceOccurred=(updatedUser.loyalty_points<0);
    log(req.user.userId,'LOYALTY_REDEEM',`${pts} points = BDT${discount}`,req.ip);
    res.json({success:true,points_used:pts,discount_bdt:discount,remaining_points:updatedUser.loyalty_points,
      ...(raceOccurred&&{note:'Race condition exploited — points redeemed multiple times.'})});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/loyalty/history',requireAuth,async(req,res)=>{
  try{
    const history=await dbAll('SELECT * FROM loyalty_redemptions WHERE customer_id=? ORDER BY redeemed_at DESC',[req.user.userId]);
    res.json({redemptions:history});
  }catch(e){res.status(500).json({error:e.message});}
});

// ════════════════════════════════════════════════════════════════
// DELIVERIES — [V8] XXE
// ════════════════════════════════════════════════════════════════

// [V8] XXE — XML manifest parsed without disabling external entities
app.post('/api/deliveries/upload',requireAuth,async(req,res)=>{
  const xmlData=req.body||'';
  if(!xmlData||typeof xmlData!=='string')return res.status(400).json({error:'XML body required'});
  try{
    // [V8] VULNERABLE — external entities not disabled
    const parseOptions={
      explicitArray:false,
      async:false,
      // No entity resolution disabled — XXE possible
    };
    const parsed=await xml2js.parseStringPromise(xmlData,parseOptions);
    const manifest=parsed?.manifest||{};

    // Check if XXE read a local file
    const manifestStr=JSON.stringify(manifest);
    

    await dbRun(
      'INSERT INTO deliveries (uuid,supplier,fuel_type,quantity,scheduled_date,manifest_xml) VALUES (?,?,?,?,?,?)',
      [uuidv4(),manifest.supplier||'Unknown',manifest.fuel||'Unknown',parseFloat(manifest.quantity)||0,manifest.date||new Date().toISOString().split('T')[0],xmlData]
    );
    log(req.user.userId,'DELIVERY_UPLOAD',`Manifest uploaded from ${req.ip}`,req.ip);
    res.json({success:true,parsed:manifest});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/deliveries',requireAuth,async(req,res)=>{
  try{
    const deliveries=await dbAll('SELECT id,uuid,supplier,fuel_type,quantity,scheduled_date,status,created_at FROM deliveries ORDER BY scheduled_date');
    res.json({deliveries});
  }catch(e){res.status(500).json({error:e.message});}
});

// ════════════════════════════════════════════════════════════════
// REPORTS — [V9] LFI
// ════════════════════════════════════════════════════════════════

// [V9] LFI — template path not sanitised
app.get('/api/reports/generate',requireAuth,async(req,res)=>{
  const template=req.query.template||'sales';
  try{
    const templatePath=template.startsWith('/')?template:path.join(__dirname,'templates',template+'.txt');
    const content=fs.readFileSync(templatePath,'utf8');
    const isLFI=!templatePath.startsWith(path.join(__dirname,'templates'));
    
    log(req.user.userId,'REPORT_GENERATE',`Template: ${template}`,req.ip);
    res.json({success:true,template,content});
  }catch(e){res.status(500).json({error:e.message,template});}
});

app.get('/api/reports/list',requireAuth,(_,res)=>{
  res.json({templates:['sales','inventory','payroll']});
});

// ════════════════════════════════════════════════════════════════
// FILE UPLOAD — [V10] MIME bypass → RCE
// ════════════════════════════════════════════════════════════════

const storage=multer.diskStorage({
  destination:(_,_f,cb)=>cb(null,UPLOADS),
  filename:(_,file,cb)=>cb(null,`${Date.now()}_${file.originalname}`)
});
const upload=multer({
  storage,
  fileFilter:(_,file,cb)=>{
    ['image/jpeg','image/png','image/gif','application/pdf'].includes(file.mimetype)
      ?cb(null,true):cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
  limits:{fileSize:5*1024*1024}
});

app.post('/api/upload/receipt',requireAuth,(req,res)=>{
  upload.single('receipt')(req,res,async(err)=>{
    if(err)return res.status(400).json({error:err.message});
    if(!req.file)return res.status(400).json({error:'No file uploaded'});
    log(req.user.userId,'RECEIPT_UPLOAD',`File: ${req.file.originalname}`,req.ip);
    res.json({success:true,filename:req.file.filename,url:`/uploads/${req.file.filename}`});
  });
});

// [V10] PHP execution
app.get('/uploads/:filename',(req,res,next)=>{
  const fp=path.join(UPLOADS,req.params.filename);
  if(!fs.existsSync(fp))return res.status(404).send('Not found');
  if(path.extname(req.params.filename).toLowerCase()==='.php'){
    try{
      const out=execSync(`php ${fp} 2>&1`,{
        env:{...process.env,QUERY_STRING:new URLSearchParams(req.query).toString()},
        timeout:5000
      });
      return res.setHeader('Content-Type','text/html').send(out.toString());
    }catch(e){return res.status(500).send(e.stdout?.toString()||e.message);}
  }
  next();
});
app.use('/uploads',express.static(UPLOADS));

// ════════════════════════════════════════════════════════════════
// MANAGER / DIRECTOR — [V11] Broken Access Control
// ════════════════════════════════════════════════════════════════

// [V11] requireAuth only — any customer accesses manager dashboard
app.get('/api/manager/dashboard',requireAuth,async(_,res)=>{
  try{
    const[customers,txns,fuel,shifts]=await Promise.all([
      dbAll('SELECT id,customer_id,name,email,phone,loyalty_points,card_number,vehicle_plate,role FROM users ORDER BY id'),
      dbAll('SELECT * FROM transactions ORDER BY created_at DESC'),
      dbAll('SELECT * FROM fuel_inventory ORDER BY fuel_type'),
      dbAll('SELECT * FROM shifts ORDER BY created_at DESC'),
    ]);
    res.json({
      customers,transactions:txns,inventory:fuel,shifts,
      
      note:'Manager dashboard accessible to any authenticated customer.'
    });
  }catch(e){res.status(500).json({error:e.message});}
});

// ════════════════════════════════════════════════════════════════
// ADMIN — [V3] Reached via JWT forgery
// ════════════════════════════════════════════════════════════════

app.get('/api/admin/stats',requireRole('admin','director'),async(_,res)=>{
  try{
    const[customers,txns,revenue,fuel]=await Promise.all([
      dbGet("SELECT COUNT(*) as c FROM users WHERE role='customer'"),
      dbGet('SELECT COUNT(*) as c FROM transactions'),
      dbGet('SELECT SUM(total) as s FROM transactions'),
      dbAll('SELECT * FROM fuel_inventory'),
    ]);
    res.json({
      customers:customers.c,transactions:txns.c,
      revenue:(revenue.s||0).toFixed(2),inventory:fuel,
      
      note:'JWT secret "acs-gas-station2025" — forged admin access.'
    });
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/users',requireRole('admin'),async(_,res)=>{
  try{res.json({users:await dbAll('SELECT * FROM users ORDER BY id')});}
  catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/audit',requireRole('admin'),async(_,res)=>{
  try{
    const logs=await dbAll(`SELECT l.*,u.name,u.customer_id FROM audit_logs l
      LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC`);
    res.json({logs});
  }catch(e){res.status(500).json({error:e.message});}
});

// ════════════════════════════════════════════════════════════════
// INTERNAL — SSRF target
// ════════════════════════════════════════════════════════════════

app.get('/api/internal/pricing',(_,res)=>{
  res.json({
    version:'1.0.0',
    jwt_secret:JWT_SECRET,
    admin_email:'admin@acs-gas-station.bd',
    pricing_engine:'ACS Gas Station Pricing v2.1',
    margins:{petrol:'12%',diesel:'10%',premium:'15%',lpg:'8%'},
    
  });
});


// NO robots.txt — by design
app.get('/robots.txt',(_,res)=>res.status(404).send('Not found'));

app.use((_,res)=>res.status(404).json({error:'Not found'}));

app.listen(PORT,()=>console.log(`
╔══════════════════════════════════════════════════════╗
║  Arena Web Security — ACS Gas Station  v1.0.0         ║
║  http://localhost:${PORT}  — 12 vulns  ║
╚══════════════════════════════════════════════════════╝`));
