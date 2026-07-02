// Floww screens
const { useState, useMemo } = React;

// ───────────────────────────────────────────
// Data
// ───────────────────────────────────────────
const TX = [
  { id: 't1', merchant: 'Supermercado Nacional', cat: 'Comida', amt: -2840.50, time: '14:32', date: '2026-05-06', day: 'Hoy', initials: 'SN', color: '#E8EEF7', card: '•••• 4521', pending: false },
  { id: 't2', merchant: 'Uber', cat: 'Transporte', amt: -385.00, time: '11:15', date: '2026-05-06', day: 'Hoy', initials: 'U', color: '#F0EBE3', card: '•••• 4521', pending: true },
  { id: 't3', merchant: 'Café Santo Domingo', cat: 'Restaurantes', amt: -245.00, time: '09:48', date: '2026-05-06', day: 'Hoy', initials: 'CS', color: '#EFE8E0', card: '•••• 4521', pending: false },
  { id: 't4', merchant: 'Banco Popular', cat: 'Salario', amt: 65000.00, time: '08:00', date: '2026-05-06', day: 'Hoy', initials: 'BP', color: '#E3EEE6', card: 'Transferencia', pending: false },
  { id: 't5', merchant: 'Claro', cat: 'Servicios', amt: -1450.00, time: '19:22', date: '2026-05-05', day: 'Ayer', initials: 'C', color: '#EDE8EE', card: '•••• 4521', pending: false },
  { id: 't6', merchant: 'Farmacia Carol', cat: 'Salud', amt: -680.30, time: '16:05', date: '2026-05-05', day: 'Ayer', initials: 'FC', color: '#EAEEE8', card: '•••• 4521', pending: false },
  { id: 't7', merchant: 'Amazon', cat: 'Compras', amt: -3200.00, time: '12:40', date: '2026-05-05', day: 'Ayer', initials: 'A', color: '#EFEAE0', card: '•••• 4521', pending: true },
  { id: 't8', merchant: 'Plaza Lama', cat: 'Hogar', amt: -890.75, time: '10:18', date: '2026-05-04', day: '4 mayo', initials: 'PL', color: '#E8EAEE', card: '•••• 4521', pending: false },
];

const CATS = [
  { name: 'Comida', amt: 8420, budget: 12000, color: '#2563EB' },
  { name: 'Transporte', amt: 2150, budget: 3500, color: '#6B7280' },
  { name: 'Restaurantes', amt: 4280, budget: 5000, color: '#8B7355' },
  { name: 'Servicios', amt: 3850, budget: 4000, color: '#94A3B8' },
  { name: 'Compras', amt: 5640, budget: 6000, color: '#475569' },
  { name: 'Salud', amt: 1240, budget: 3000, color: '#64748B' },
];

const fmt = (n) => {
  const abs = Math.abs(n);
  return 'RD$ ' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ───────────────────────────────────────────
// Icons
// ───────────────────────────────────────────
const Icon = {
  bell: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2zm-6 5a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2z" fill={c}/></svg>,
  home: (c='currentColor') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/></svg>,
  list: (c='currentColor') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h10" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  chart: (c='currentColor') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 19V11M12 19V5M19 19v-6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  budget: (c='currentColor') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.8"/><path d="M12 7v5l3 2" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  plus: (c='#fff') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2.2" strokeLinecap="round"/></svg>,
  back: (c='currentColor') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chev: (c='currentColor') => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>,
};

// ───────────────────────────────────────────
// Bottom Nav
// ───────────────────────────────────────────
function BottomNav({ active, onNav, theme }) {
  const items = [
    { id: 'home', label: 'Inicio', icon: Icon.home },
    { id: 'tx', label: 'Transacciones', icon: Icon.list },
    { id: 'add' },
    { id: 'charts', label: 'Gráficas', icon: Icon.chart },
    { id: 'budget', label: 'Presupuesto', icon: Icon.budget },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: 28, paddingTop: 10,
      background: theme.surface,
      borderTop: `1px solid ${theme.border}`,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      zIndex: 10,
    }}>
      {items.map(it => {
        if (it.id === 'add') {
          return (
            <button key="add" onClick={() => onNav('add')} style={{
              width: 56, height: 40, borderRadius: 20, border: 'none',
              background: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37,99,235,0.35)', cursor: 'pointer',
              transform: 'translateY(-8px)',
            }}>
              {Icon.plus()}
            </button>
          );
        }
        const isActive = active === it.id;
        const c = isActive ? theme.accent : theme.textSec;
        return (
          <button key={it.id} onClick={() => onNav(it.id)} style={{
            background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 3, cursor: 'pointer', padding: '4px 6px',
            width: 60,
          }}>
            {it.icon(c)}
            <span style={{ fontSize: 10, fontWeight: 500, color: c, letterSpacing: -0.1 }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────
// Donut SVG
// ───────────────────────────────────────────
function Donut({ income, expenses, theme, size = 140, stroke = 14 }) {
  const total = income + expenses;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const ePct = expenses / total;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={theme.income} strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={theme.expense} strokeWidth={stroke}
        strokeDasharray={`${C * ePct} ${C}`}
        strokeDashoffset={C * 0.25}
        transform={`rotate(-90 ${size/2} ${size/2})`}
        strokeLinecap="butt"/>
    </svg>
  );
}

// ───────────────────────────────────────────
// HOME
// ───────────────────────────────────────────
function HomeScreen({ theme, onNav, onPickTx }) {
  const income = 65000;
  const expenses = 12690.55;
  const balance = income - expenses;
  const recent = TX.slice(0, 4);
  return (
    <div style={{ paddingBottom: 100 }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 19, background: theme.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 600, fontSize: 14, letterSpacing: 0.3,
          }}>HJ</div>
          <div>
            <div style={{ fontSize: 11, color: theme.textSec, fontWeight: 500 }}>Buenos días</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: theme.text, letterSpacing: -0.3 }}>Hola, Harold</div>
          </div>
        </div>
        <button style={{
          width: 38, height: 38, borderRadius: 19, background: theme.surface,
          border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: theme.text, position: 'relative',
        }}>
          {Icon.bell(theme.text)}
          <span style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 4, background: theme.expense, border: `1.5px solid ${theme.surface}` }}/>
        </button>
      </div>

      {/* balance card */}
      <div style={{ margin: '0 20px', padding: '24px 22px', background: theme.surface, borderRadius: 20, boxShadow: theme.shadow, border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: theme.textSec, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>Balance disponible</div>
          <Donut income={income} expenses={expenses} theme={theme} size={44} stroke={5}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 14, color: theme.textSec, fontWeight: 600 }}>RD$</span>
          <span style={{ fontSize: 38, fontWeight: 800, color: theme.text, letterSpacing: -1.2, lineHeight: 1 }}>
            {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, background: theme.bg, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: theme.income }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: theme.textSec, fontWeight: 500 }}>Ingresos</div>
              <div style={{ fontSize: 13, color: theme.income, fontWeight: 700, letterSpacing: -0.2 }}>+{fmt(income).replace('RD$ ', 'RD$')}</div>
            </div>
          </div>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, background: theme.bg, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: theme.expense }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: theme.textSec, fontWeight: 500 }}>Gastos</div>
              <div style={{ fontSize: 13, color: theme.expense, fontWeight: 700, letterSpacing: -0.2 }}>−{fmt(expenses).replace('RD$ ', 'RD$')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* pending notice */}
      <div onClick={() => onNav('tx')} style={{ margin: '14px 20px 0', padding: '12px 16px', background: theme.surface, borderRadius: 14, border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(37,99,235,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.accent }}>2</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Transacciones por confirmar</div>
          <div style={{ fontSize: 11, color: theme.textSec }}>Importadas desde Gmail · Toca para revisar</div>
        </div>
        {Icon.chev(theme.textSec)}
      </div>

      {/* recent header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 20px 10px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, letterSpacing: 0.2, textTransform: 'uppercase' }}>Transacciones recientes</div>
        <button onClick={() => onNav('tx')} style={{ background: 'none', border: 'none', color: theme.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ver todas →</button>
      </div>

      {/* recent list */}
      <div style={{ margin: '0 20px', background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        {recent.map((t, i) => (
          <TxRow key={t.id} t={t} theme={theme} onClick={() => onPickTx(t)} divider={i < recent.length - 1}/>
        ))}
      </div>
    </div>
  );
}

function TxRow({ t, theme, onClick, divider }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
      borderBottom: divider ? `1px solid ${theme.border}` : 'none', cursor: 'pointer',
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 19, background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3a3a44' }}>{t.initials}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: theme.text, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
          {t.pending && <span style={{ fontSize: 9, fontWeight: 700, color: theme.accent, background: 'rgba(37,99,235,0.10)', padding: '2px 6px', borderRadius: 4, letterSpacing: 0.3 }}>POR CONFIRMAR</span>}
        </div>
        <div style={{ fontSize: 11, color: theme.textSec, marginTop: 2 }}>{t.cat} · {t.time}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.amt >= 0 ? theme.income : theme.text, letterSpacing: -0.2 }}>
          {t.amt >= 0 ? '+' : '−'}{fmt(t.amt)}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────
// TRANSACTIONS LIST
// ───────────────────────────────────────────
function TxScreen({ theme, onPickTx }) {
  const [filter, setFilter] = useState('Todos');
  const tabs = ['Todos', 'Gastos', 'Ingresos', 'Por confirmar'];
  const pendingCount = TX.filter(t => t.pending).length;

  const filtered = TX.filter(t => {
    if (filter === 'Gastos') return t.amt < 0;
    if (filter === 'Ingresos') return t.amt >= 0;
    if (filter === 'Por confirmar') return t.pending;
    return true;
  });

  const groups = filtered.reduce((acc, t) => {
    const d = `${t.day} — ${t.date.split('-').slice(1).reverse().map(s => parseInt(s)).join(' ').replace('5', 'mayo').replace(/^(\d+) mayo$/, '$1 mayo')}`;
    const key = t.day === 'Hoy' ? 'Hoy — 6 mayo' : t.day === 'Ayer' ? 'Ayer — 5 mayo' : '4 mayo';
    (acc[key] = acc[key] || []).push(t);
    return acc;
  }, {});

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '8px 20px 16px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: theme.text, margin: 0, letterSpacing: -0.8 }}>Transacciones</h1>
      </div>

      {/* Filter tabs */}
      <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {tabs.map(t => {
          const active = filter === t;
          return (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding: '8px 14px', borderRadius: 999,
              background: active ? theme.text : theme.surface,
              color: active ? theme.surface : theme.text,
              border: `1px solid ${active ? theme.text : theme.border}`,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}>
              {t}
              {t === 'Por confirmar' && pendingCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: active ? theme.surface : theme.accent,
                  color: active ? theme.text : '#fff',
                  borderRadius: 8, padding: '1px 6px', minWidth: 16, textAlign: 'center',
                }}>{pendingCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {Object.entries(groups).map(([day, items]) => (
        <div key={day} style={{ marginBottom: 12 }}>
          <div style={{ padding: '8px 20px 8px', fontSize: 11, fontWeight: 600, color: theme.textSec, letterSpacing: 0.5, textTransform: 'uppercase' }}>{day}</div>
          <div style={{ margin: '0 20px', background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            {items.map((t, i) => (
              <TxRow key={t.id} t={t} theme={theme} onClick={() => onPickTx(t)} divider={i < items.length - 1}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────
// TRANSACTION DETAIL
// ───────────────────────────────────────────
function DetailScreen({ tx, theme, onBack }) {
  const [cat, setCat] = useState(tx.cat);
  const cats = ['Comida', 'Transporte', 'Restaurantes', 'Servicios', 'Compras', 'Salud', 'Hogar', 'Entretenimiento'];
  const [note, setNote] = useState('');
  return (
    <div style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 8px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer', color: theme.text }}>
          {Icon.back(theme.text)}
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600, color: theme.text, letterSpacing: -0.2 }}>Confirmar transacción</div>
        <div style={{ width: 38 }}/>
      </div>

      {/* large amount */}
      <div style={{ textAlign: 'center', padding: '20px 20px 28px' }}>
        <div style={{ fontSize: 11, color: theme.textSec, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
          {tx.amt < 0 ? 'Gasto' : 'Ingreso'}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 16, color: theme.textSec, fontWeight: 700 }}>RD$</span>
          <span style={{ fontSize: 44, fontWeight: 800, color: tx.amt < 0 ? theme.text : theme.income, letterSpacing: -1.5, lineHeight: 1 }}>
            {Math.abs(tx.amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div style={{ fontSize: 14, color: theme.textSec, marginTop: 10, fontWeight: 500 }}>{tx.merchant}</div>
      </div>

      {/* info rows */}
      <div style={{ margin: '0 20px', background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        {[
          ['Comercio', tx.merchant],
          ['Fecha', '6 de mayo, 2026'],
          ['Hora', tx.time],
          ['Tarjeta', tx.card],
        ].map(([k, v], i, a) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 16px', borderBottom: i < a.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
            <span style={{ fontSize: 13, color: theme.textSec, fontWeight: 500 }}>{k}</span>
            <span style={{ fontSize: 13, color: theme.text, fontWeight: 600, letterSpacing: -0.1 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* AI categories */}
      <div style={{ padding: '24px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.accent, background: 'rgba(37,99,235,0.10)', padding: '2px 6px', borderRadius: 4, letterSpacing: 0.3 }}>IA</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text, letterSpacing: 0.2, textTransform: 'uppercase' }}>Categoría sugerida</span>
        </div>
      </div>
      <div style={{ paddingLeft: 20, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, paddingRight: 20 }}>
        {cats.map(c => {
          const active = cat === c;
          return (
            <button key={c} onClick={() => setCat(c)} style={{
              padding: '8px 14px', borderRadius: 999, whiteSpace: 'nowrap',
              background: active ? theme.accent : theme.surface,
              color: active ? '#fff' : theme.text,
              border: `1px solid ${active ? theme.accent : theme.border}`,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{c}</button>
          );
        })}
      </div>

      {/* note */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, letterSpacing: 0.2, textTransform: 'uppercase', marginBottom: 8 }}>Nota</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Añadir nota..." style={{
          width: '100%', minHeight: 70, padding: 12, background: theme.surface,
          border: `1px solid ${theme.border}`, borderRadius: 12,
          fontSize: 13, color: theme.text, resize: 'none', outline: 'none', boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}/>
      </div>

      {/* CTA */}
      <div style={{ padding: '24px 20px 0' }}>
        <button onClick={onBack} style={{
          width: '100%', padding: '16px', borderRadius: 14, border: 'none',
          background: theme.accent, color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', letterSpacing: -0.2,
          boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
        }}>Confirmar</button>
        <button style={{
          width: '100%', padding: '12px', background: 'none', border: 'none',
          color: theme.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 6,
        }}>Editar monto</button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────
// CHARTS
// ───────────────────────────────────────────
function ChartsScreen({ theme }) {
  const totalSpend = CATS.reduce((s, c) => s + c.amt, 0);
  const days = [320, 850, 240, 1200, 0, 480, 980, 1450, 220, 0, 660, 890, 540, 1100, 380, 720, 1320, 0, 410, 0, 850, 1240, 580, 0, 920, 1080, 380, 0, 0, 240, 0];
  const maxDay = Math.max(...days);

  // Donut math
  const segs = [];
  let acc = 0;
  CATS.forEach(c => {
    segs.push({ ...c, start: acc / totalSpend, end: (acc + c.amt) / totalSpend });
    acc += c.amt;
  });

  const r = 60, stroke = 18, size = 160;
  const C = 2 * Math.PI * r;

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '8px 20px 12px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: theme.text, margin: 0, letterSpacing: -0.8 }}>Gráficas</h1>
      </div>

      {/* month selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '4px 0 16px' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSec, fontSize: 18, padding: 6 }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: theme.text, letterSpacing: -0.2 }}>Mayo 2026</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSec, fontSize: 18, padding: 6 }}>›</button>
      </div>

      {/* summary 3 cards */}
      <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8 }}>
        {[
          { lbl: 'Ingresos', val: 65000, c: theme.income, sign: '+' },
          { lbl: 'Gastos', val: totalSpend, c: theme.expense, sign: '−' },
          { lbl: 'Neto', val: 65000 - totalSpend, c: theme.text, sign: '' },
        ].map(s => (
          <div key={s.lbl} style={{ flex: 1, padding: '12px 12px', background: theme.surface, borderRadius: 14, border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 10, color: theme.textSec, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{s.lbl}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: s.c, marginTop: 4, letterSpacing: -0.3 }}>
              {s.sign}{(s.val/1000).toFixed(1)}k
            </div>
            <div style={{ fontSize: 9, color: theme.textSec, fontWeight: 500, marginTop: 1 }}>RD$</div>
          </div>
        ))}
      </div>

      {/* donut */}
      <div style={{ margin: '0 20px', background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: '20px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.textSec, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 14 }}>Por categoría</div>
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segs.map((s, i) => (
              <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${C * (s.end - s.start)} ${C}`}
                strokeDashoffset={-C * s.start + C * 0.25}
                transform={`rotate(-90 ${size/2} ${size/2})`}/>
            ))}
          </svg>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, color: theme.textSec, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>Total</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: theme.text, letterSpacing: -0.4 }}>RD$ {(totalSpend/1000).toFixed(1)}k</div>
          </div>
        </div>

        {/* category list */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CATS.map(c => {
            const pct = c.amt / totalSpend;
            return (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: c.color }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{c.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.text, letterSpacing: -0.2 }}>{fmt(c.amt)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: theme.bg, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct * 100}%`, background: c.color, borderRadius: 2 }}/>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textSec, width: 32, textAlign: 'right' }}>{(pct * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* daily bars */}
      <div style={{ margin: '14px 20px 0', background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: '20px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.textSec, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 14 }}>Gasto diario</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
          {days.map((d, i) => (
            <div key={i} style={{ flex: 1, height: `${(d / maxDay) * 100}%`, minHeight: d > 0 ? 2 : 0, background: theme.accent, opacity: d > 0 ? (i < 6 ? 0.4 : 1) : 0.1, borderRadius: 2 }}/>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, color: theme.textSec, fontWeight: 500 }}>
          <span>1</span><span>8</span><span>15</span><span>22</span><span>31</span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────
// BUDGET
// ───────────────────────────────────────────
function BudgetScreen({ theme }) {
  const totalUsed = CATS.reduce((s, c) => s + c.amt, 0);
  const totalBudget = CATS.reduce((s, c) => s + c.budget, 0);
  const overallPct = totalUsed / totalBudget;

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '8px 20px 12px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: theme.text, margin: 0, letterSpacing: -0.8 }}>Presupuesto</h1>
        <div style={{ fontSize: 13, color: theme.textSec, marginTop: 4, fontWeight: 500 }}>Mayo 2026</div>
      </div>

      {/* overall card */}
      <div style={{ margin: '0 20px 16px', padding: '20px', background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSec, letterSpacing: 0.3, textTransform: 'uppercase' }}>Total utilizado</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: theme.text, letterSpacing: -0.6 }}>{(overallPct * 100).toFixed(0)}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: theme.bg, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ height: '100%', width: `${overallPct * 100}%`, background: overallPct > 0.8 ? theme.expense : theme.accent, borderRadius: 4 }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: theme.textSec, fontWeight: 500 }}>
          <span style={{ color: theme.text, fontWeight: 600 }}>{fmt(totalUsed)}</span>
          <span>de {fmt(totalBudget)}</span>
        </div>
      </div>

      {/* category cards */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CATS.map(c => {
          const pct = c.amt / c.budget;
          const over = pct > 0.8;
          return (
            <div key={c.name} style={{ padding: '16px', background: theme.surface, borderRadius: 14, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: c.color }}/>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: theme.text, letterSpacing: -0.2 }}>{c.name}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: over ? theme.expense : theme.textSec, letterSpacing: -0.1 }}>{(pct * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: theme.bg, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 1) * 100}%`, background: over ? theme.expense : theme.accent, borderRadius: 3 }}/>
              </div>
              <div style={{ fontSize: 11, color: theme.textSec, fontWeight: 500 }}>
                <span style={{ color: theme.text, fontWeight: 600 }}>{fmt(c.amt)}</span> usado de {fmt(c.budget)}
              </div>
            </div>
          );
        })}

        <button style={{
          padding: '14px', borderRadius: 14, background: 'none',
          border: `1.5px dashed ${theme.border}`, color: theme.textSec,
          fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 6,
        }}>+ Agregar categoría</button>
      </div>
    </div>
  );
}

Object.assign(window, {
  HomeScreen, TxScreen, DetailScreen, ChartsScreen, BudgetScreen, BottomNav, Icon, TX,
});
