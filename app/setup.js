'use strict';
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'data', 'fuel.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid          TEXT UNIQUE NOT NULL,
    customer_id   TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password      TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT DEFAULT 'customer',
    phone         TEXT,
    loyalty_points INTEGER DEFAULT 0,
    card_number   TEXT,
    vehicle_plate TEXT,
    station_id    TEXT DEFAULT 'ACS-GH-001',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid         TEXT UNIQUE NOT NULL,
    customer_id  INTEGER NOT NULL,
    pump_number  INTEGER NOT NULL,
    fuel_type    TEXT NOT NULL,
    litres       REAL NOT NULL,
    price_per_litre REAL NOT NULL,
    total        REAL NOT NULL,
    payment_method TEXT DEFAULT 'card',
    card_last4   TEXT,
    loyalty_earned INTEGER DEFAULT 0,
    station_id   TEXT DEFAULT 'ACS-GH-001',
    attendant_id INTEGER,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS fuel_inventory (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fuel_type    TEXT UNIQUE NOT NULL,
    price_per_litre REAL NOT NULL,
    tank_capacity REAL NOT NULL,
    current_level REAL NOT NULL,
    last_delivery DATETIME,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS deliveries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid         TEXT UNIQUE NOT NULL,
    supplier     TEXT NOT NULL,
    fuel_type    TEXT NOT NULL,
    quantity     REAL NOT NULL,
    scheduled_date TEXT NOT NULL,
    status       TEXT DEFAULT 'scheduled',
    manifest_xml TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS shifts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id  INTEGER NOT NULL,
    pump_number  INTEGER,
    shift_start  TEXT NOT NULL,
    shift_end    TEXT,
    sales_total  REAL DEFAULT 0,
    litres_sold  REAL DEFAULT 0,
    status       TEXT DEFAULT 'active',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS loyalty_redemptions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id  INTEGER NOT NULL,
    points_used  INTEGER NOT NULL,
    discount_bdt REAL NOT NULL,
    redeemed_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER,
    action       TEXT NOT NULL,
    details      TEXT,
    ip_address   TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Users ────────────────────────────────────────────────────────
  const users = [
    { uuid:uuidv4(), customer_id:'ACS-ADM-001', email:'admin@acs-gas-station.bd',       password:'AcsAdmin@123', name:'System Administrator', role:'admin',    phone:'+880200000001', loyalty_points:0,    card_number:'4532-0000-0000-0001', vehicle_plate:'ADM-001' },
    { uuid:uuidv4(), customer_id:'ACS-MGR-001', email:'manager@acs-gas-station.bd',     password:'Manager@2024',  name:'Station Manager Rahim', role:'manager',  phone:'+880200000002', loyalty_points:500,  card_number:'4532-0000-0000-0002', vehicle_plate:'MGR-001' },
    { uuid:uuidv4(), customer_id:'ACS-ATT-001', email:'attendant@acs-gas-station.bd',   password:'Attend@2024',   name:'Pump Attendant Ayesha',   role:'attendant',phone:'+880200000003', loyalty_points:120,  card_number:'4532-0000-0000-0003', vehicle_plate:'ATT-001' },
    { uuid:uuidv4(), customer_id:'ACS-CST-001', email:'kwame@gmail.com',         password:'Kwame@2024',    name:'Karim Ahmed',         role:'customer', phone:'+880200000004', loyalty_points:2340, card_number:'4532-8821-4455-6677', vehicle_plate:'DHA-1234' },
    { uuid:uuidv4(), customer_id:'ACS-CST-002', email:'abena@gmail.com',         password:'Abena@2024',    name:'Abida Rahman',          role:'customer', phone:'+880200000005', loyalty_points:890,  card_number:'5431-2244-8866-9900', vehicle_plate:'CTG-5678' },
    { uuid:uuidv4(), customer_id:'ACS-CST-003', email:'yaw@gmail.com',           password:'Yaw@2024!',     name:'Yeasin Talukder',            role:'customer', phone:'+880200000006', loyalty_points:4200, card_number:'4111-7733-2299-4455', vehicle_plate:'SYL-9012' },
    { uuid:uuidv4(), customer_id:'ACS-CST-004', email:'akosua@gmail.com',        password:'Akosua@2024',   name:'Asma Khatun',        role:'customer', phone:'+880200000007', loyalty_points:150,  card_number:'5500-3344-7788-1122', vehicle_plate:'RAJ-3456' },
    { uuid:uuidv4(), customer_id:'ACS-DIR-001', email:'director@acsconsult.com',password:'Director@24',   name:'Regional Director',    role:'director', phone:'+880200000008', loyalty_points:0,    card_number:'4532-0000-0000-0009', vehicle_plate:'DIR-001' },
  ];

  users.forEach(u => db.run(
    `INSERT OR IGNORE INTO users (uuid,customer_id,email,password,name,role,phone,loyalty_points,card_number,vehicle_plate)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [u.uuid,u.customer_id,u.email,u.password,u.name,u.role,u.phone,u.loyalty_points,u.card_number,u.vehicle_plate]
  ));

  // Fuel inventory
  const fuels = [
    ['Petrol',  125.00, 50000, 32400],
    ['Diesel',  109.00, 60000, 45200],
    ['Octane',  130.00, 30000, 18900],
    ['LPG',      65.00, 20000, 9800 ],
  ];
  fuels.forEach(([type,price,cap,level]) => db.run(
    `INSERT OR IGNORE INTO fuel_inventory (fuel_type,price_per_litre,tank_capacity,current_level,last_delivery) VALUES (?,?,?,?,?)`,
    [type,price,cap,level,'2025-08-01']
  ));

  setTimeout(() => {
    db.all('SELECT id FROM users WHERE role="customer" ORDER BY id LIMIT 4', [], (e, custs) => {
      db.get('SELECT id FROM users WHERE role="attendant" LIMIT 1', [], (e2, att) => {
        if (!custs||!att) return;

        // Transactions
        const txns = [
          [custs[0].id,2,'Petrol',   45.5, 125.00, 5687.5, 'card', '6677', 66, att.id],
          [custs[0].id,1,'Diesel',   80.0, 109.00, 8720.0, 'card', '6677', 80, att.id],
          [custs[1].id,3,'Octane',   30.0, 130.00, 3900.0, 'card', '9900', 30, att.id],
          [custs[2].id,4,'Petrol',   60.0, 125.00, 7500.0, 'card', '4455', 60, att.id],
          [custs[2].id,2,'LPG',     120.0,  65.00, 7800.0, 'cash', null,  120, att.id],
          [custs[3].id,1,'Diesel',   25.0, 109.00, 2725.0, 'card', '1122', 25, att.id],
        ];
        txns.forEach(t => db.run(
          `INSERT OR IGNORE INTO transactions (uuid,customer_id,pump_number,fuel_type,litres,price_per_litre,total,payment_method,card_last4,loyalty_earned,attendant_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(),...t]
        ));

        // Deliveries with XML manifests
        db.run(`INSERT OR IGNORE INTO deliveries (uuid,supplier,fuel_type,quantity,scheduled_date,status,manifest_xml) VALUES (?,?,?,?,?,?,?)`,
          [uuidv4(),'Gulf Oil Ltd','Petrol (91)',30000,'2025-08-20','scheduled',
           '<?xml version="1.0"?><manifest><supplier>Gulf Oil Ltd</supplier><fuel>Petrol 91</fuel><quantity>30000</quantity><station>ACS-GH-001</station></manifest>']
        );

        // Shifts
        db.run(`INSERT OR IGNORE INTO shifts (employee_id,pump_number,shift_start,shift_end,sales_total,litres_sold,status) VALUES (?,?,?,?,?,?,?)`,
          [att.id,2,'2025-08-15 06:00','2025-08-15 14:00',3419.75,235.5,'completed']
        );

        // Audit logs
        db.get('SELECT id FROM users WHERE role="admin"', [], (e3, admin) => {
          if (!admin) return;
          [
            [admin.id,'SYSTEM_INIT','ACS Gas Station system initialised','127.0.0.1'],
            [admin.id,'PRICE_UPDATE','Fuel prices updated for August 2025','127.0.0.1'],
            [null,'LOGIN_FAILED','admin@acs-gas-station.bd from 10.0.0.1','10.0.0.1'],
          ].forEach(([uid,action,detail,ip]) =>
            db.run('INSERT OR IGNORE INTO audit_logs (user_id,action,details,ip_address) VALUES (?,?,?,?)',[uid,action,detail,ip])
          );
        });
      });
    });
  }, 600);

  console.log('[ACS Gas Station] Database seeded.');
});
setTimeout(() => db.close(), 3500);
