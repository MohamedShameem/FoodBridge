'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Donation = { id:string; donor:string; area:string; foodType:string; meals:number; pickupBy:string; refrigerated:number; status:string; partnerId:string|null; driverId:string|null; createdAt:string };
type Activity = { id:number; donationId:string; kind:string; title:string; detail:string; createdAt:string };
type Partner = { id:string; name:string; area:string; distanceKm:number; capacity:number; refrigerated:number; reliability:number };
type Driver = { id:string; name:string; area:string; vehicle:string; status:string; completedTrips:number };
type AppState = { donations:Donation[]; activities:Activity[]; partners:Partner[]; drivers:Driver[]; current:Donation|null; runtimeMode:'agentcore'|'demo'; metrics:{ mealsRescued:number; successfulMatches:number; rescuesToday:number } };

const fallback: AppState = {
  donations: [
    { id:'FB-284', donor:'Harbor Kitchen', area:'Salmiya', foodType:'Packaged chicken meals', meals:60, pickupBy:'9:00 PM', refrigerated:1, status:'approval_required', partnerId:'partner-1', driverId:null, createdAt:'2026-09-08T16:30:00.000Z' },
    { id:'FB-283', donor:'Cedar Bakery', area:'Hawally', foodType:'Bread and pastries', meals:42, pickupBy:'1:30 PM', refrigerated:0, status:'completed', partnerId:'partner-2', driverId:'driver-2', createdAt:'2026-09-08T15:30:00.000Z' },
  ],
  activities: [
    { id:1, donationId:'FB-284', kind:'done', title:'Donation understood', detail:'60 chilled meals · collect before 9:00 PM', createdAt:'2026-09-08T16:30:00.000Z' },
    { id:2, donationId:'FB-284', kind:'done', title:'4 eligible partners found', detail:'Filtered by capacity, refrigeration and distance', createdAt:'2026-09-08T16:30:01.000Z' },
    { id:3, donationId:'FB-284', kind:'active', title:'Waiting for your approval', detail:'Bayt Al Khair is the strongest match', createdAt:'2026-09-08T16:30:02.000Z' },
  ],
  partners: [
    { id:'partner-1', name:'Bayt Al Khair Community Pantry', area:'Salmiya', distanceKm:2.4, capacity:80, refrigerated:1, reliability:96 },
    { id:'partner-2', name:'Hope Table Food Bank', area:'Hawally', distanceKm:5.1, capacity:140, refrigerated:1, reliability:93 },
    { id:'partner-3', name:'Neighborhood Fridge Collective', area:'Shaab', distanceKm:7.8, capacity:45, refrigerated:0, reliability:88 },
    { id:'partner-4', name:'Al Noor Family Centre', area:'Jabriya', distanceKm:8.6, capacity:110, refrigerated:1, reliability:91 },
  ],
  drivers: [
    { id:'driver-1', name:'Omar Al-Sabah', area:'Salmiya', vehicle:'Refrigerated van', status:'Available', completedTrips:48 },
    { id:'driver-2', name:'Lina Haddad', area:'Hawally', vehicle:'SUV', status:'On delivery', completedTrips:31 },
    { id:'driver-3', name:'Yousef Karim', area:'Jabriya', vehicle:'Van', status:'Available', completedTrips:57 },
  ],
  current: null,
  runtimeMode: 'demo',
  metrics: { mealsRescued:286, successfulMatches:94, rescuesToday:8 },
};
fallback.current = fallback.donations[0];

const navItems = [
  ['overview','Overview'], ['donations','Donations'], ['partners','Partners'], ['drivers','Drivers'], ['impact','Impact'],
] as const;

function statusLabel(status:string) {
  return ({ approval_required:'Ready to match', scheduled:'Pickup scheduled', completed:'Delivered' } as Record<string,string>)[status] ?? status;
}

export default function Home() {
  const [data, setData] = useState<AppState>(fallback);
  const [view, setView] = useState('overview');
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/rescues').then((response) => {
      if (!response.ok) throw new Error('Unable to load rescue workspace');
      return response.json();
    }).then(setData).catch(() => setNotice('Demo data is active while the workspace reconnects.'));
  }, []);

  const current = data.current ?? data.donations[0];
  const partner = data.partners.find((item) => item.id === current?.partnerId) ?? data.partners[0];
  const driver = data.drivers.find((item) => item.id === current?.driverId);
  const activity = useMemo(() => data.activities.filter((item) => item.donationId === current?.id), [data.activities, current?.id]);

  async function act(action:string, extra:Record<string, unknown> = {}) {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/rescues', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ action, id:current?.id, ...extra }) });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || 'The agent could not complete that step.');
      setData(next);
      setNotice(action === 'approve' ? 'Match approved. The agent arranged the recipient and driver.' : action === 'reroute' ? 'Fallback plan complete. A new recipient is ready.' : action === 'complete' ? 'Delivery confirmed and impact recorded.' : 'Donation received and matched.');
      setModalOpen(false); setView('overview');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  function submitDonation(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act('create', { donor:form.get('donor'), area:form.get('area'), foodType:form.get('foodType'), meals:Number(form.get('meals')), pickupBy:form.get('pickupBy'), refrigerated:form.get('refrigerated') === 'on' });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('overview')} aria-label="FoodBridge home"><span className="brand-mark">F</span><span>FoodBridge</span></button>
        <nav className="nav" aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map(([id,label], index) => <button key={id} className={`nav-item ${view===id?'active':''}`} onClick={() => setView(id)}><span className="nav-icon">0{index+1}</span>{label}</button>)}
        </nav>
        <div className="sidebar-card"><span className="pulse-dot" /><div><strong>Agent online</strong><p>{data.runtimeMode === 'agentcore' ? 'AgentCore live' : 'Safe demo mode'}</p></div></div>
        <div className="profile"><span className="avatar">MR</span><div><strong>Maya Rahman</strong><p>Operations lead</p></div><span className="more">···</span></div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">Tuesday, 8 September</p><h1>{view === 'overview' ? 'Good afternoon, Maya.' : navItems.find(([id])=>id===view)?.[1]}</h1></div>
          <button className="primary-button" onClick={() => setModalOpen(true)}><span>+</span> New donation</button>
        </header>
        {notice && <div className="toast" role="status"><span>✦</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}

        {view === 'overview' && current && partner && <>
          <section className="hero-strip" aria-label="Impact today">
            <div className="hero-copy"><span className="live-pill"><i /> Live impact</span><h2>Good food is moving,<br />not going to waste.</h2><p>Your agent has coordinated {data.metrics.rescuesToday} rescues today without unnecessary intervention.</p></div>
            <div className="metric"><span className="metric-number">{data.metrics.mealsRescued}</span><span className="metric-label">meals rescued</span><span className="metric-trend">↑ 18% this week</span></div>
            <div className="metric"><span className="metric-number">{data.metrics.successfulMatches}<span>%</span></span><span className="metric-label">successful matches</span><span className="metric-note">Across active partners</span></div>
          </section>

          <div className="section-heading"><div><p className="eyebrow">{current.status === 'completed' ? 'Recently completed' : 'Needs attention'}</p><h2>{current.status === 'approval_required' ? 'One decision, then we’ll take it from here.' : current.status === 'scheduled' ? 'Everything is arranged. Confirm the handoff when ready.' : 'This rescue made an impact.'}</h2></div><button className="text-button" onClick={() => setView('donations')}>View all donations →</button></div>

          <section className="decision-grid">
            <article className="donation-card">
              <div className="card-head">
                <div className={`food-visual ${current.status}`}><span>{current.meals}</span><small>meals</small></div>
                <div className="donation-title"><span className={`status-chip ${current.status}`}>{statusLabel(current.status)}</span><h3>{current.foodType}</h3><p>{current.donor} · {current.area} · {current.id}</p></div>
                <span className="deadline"><b>{current.pickupBy}</b><small>{current.status === 'completed' ? 'delivered on time' : 'collection deadline'}</small></span>
              </div>
              <div className="route-line"><span className="route-stop done">D</span><i /><span className={`route-stop ${current.status!=='approval_required'?'done':''}`}>P</span><i /><span className={`route-stop ${current.status==='completed'?'done':''}`}>R</span></div>
              <div className="route-labels"><span>{current.donor}<small>Donor</small></span><span>{driver?.name ?? 'Driver pending'}<small>Pickup</small></span><span>{partner.name}<small>Recipient</small></span></div>
              <div className="match-card"><div className="match-rank">1</div><div className="match-info"><div><h4>{partner.name}</h4><span className="fit">{partner.reliability}% fit</span></div><p>{partner.distanceKm} km away · {partner.refrigerated ? 'Refrigerated storage' : 'Ambient storage'} · Capacity for {partner.capacity} meals</p></div></div>
              <div className="card-actions">
                {current.status === 'approval_required' && <><button className="approve-button" disabled={busy} onClick={() => void act('approve')}>{busy?'Working…':'Approve match'}</button><button className="secondary-button" disabled={busy} onClick={() => void act('reroute')}>Run fallback demo</button><span>Approval is required before we contact the recipient.</span></>}
                {current.status === 'scheduled' && <><button className="approve-button" disabled={busy} onClick={() => void act('complete')}>{busy?'Recording…':'Confirm delivery'}</button><span>The impact receipt is generated after confirmation.</span></>}
                {current.status === 'completed' && <div className="completion-banner"><span>✓</span><p><strong>{current.meals} meals delivered</strong>Impact receipt sent to both organizations.</p></div>}
              </div>
            </article>

            <aside className="agent-card" aria-label="Agent activity">
              <div className="agent-head"><div><span className="agent-orb" /><div><p>FoodBridge Agent</p><strong>{current.status === 'completed' ? 'Rescue completed' : current.status === 'scheduled' ? 'Monitoring pickup' : 'Coordinating rescue'}</strong></div></div><span className="running">{current.status === 'completed' ? 'Complete' : 'Running'}</span></div>
              <div className="timeline">{activity.map((item) => <div className={`timeline-item ${item.kind}`} key={item.id}><span className="timeline-marker">{item.kind==='done'?'✓':item.kind==='warning'?'!':''}</span><div><time>{new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'2-digit', timeZone:'Asia/Kuwait' }).format(new Date(item.createdAt))}</time><h4>{item.title}</h4><p>{item.detail}</p></div></div>)}</div>
              <div className="agent-note"><span>✦</span><p><strong>Why this match?</strong>Closest partner that meets every food-safety constraint and can accept the full donation.</p></div>
            </aside>
          </section>
        </>}

        {view === 'donations' && <DataSection eyebrow="Live operations" title="Every rescue, one accountable timeline."><div className="table-card"><div className="table-row table-head-row"><span>Donation</span><span>Food</span><span>Meals</span><span>Recipient</span><span>Status</span></div>{data.donations.map((item) => { const p=data.partners.find((candidate)=>candidate.id===item.partnerId); return <button className="table-row" key={item.id} onClick={() => { setData({...data,current:item}); setView('overview'); }}><span><strong>{item.donor}</strong><small>{item.id} · {item.area}</small></span><span>{item.foodType}</span><span>{item.meals}</span><span>{p?.name ?? 'Matching…'}</span><span><i className={`table-status ${item.status}`} />{statusLabel(item.status)}</span></button>; })}</div></DataSection>}

        {view === 'partners' && <DataSection eyebrow="Recipient network" title="Verified capacity, ready when it matters."><div className="entity-grid">{data.partners.map((item,index)=><article className="entity-card" key={item.id}><span className="entity-avatar">{String(index+1).padStart(2,'0')}</span><span className="entity-state">Verified</span><h3>{item.name}</h3><p>{item.area} · {item.distanceKm} km from current donor</p><div><span><b>{item.capacity}</b> meal capacity</span><span><b>{item.reliability}%</b> reliability</span></div><small>{item.refrigerated ? '❄ Refrigerated storage' : '○ Ambient food only'}</small></article>)}</div></DataSection>}

        {view === 'drivers' && <DataSection eyebrow="Volunteer fleet" title="The last mile, coordinated automatically."><div className="entity-grid drivers-grid">{data.drivers.map((item)=><article className="entity-card" key={item.id}><span className="entity-avatar driver-avatar">{item.name.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><span className={`entity-state ${item.status==='Available'?'available':''}`}>{item.status}</span><h3>{item.name}</h3><p>{item.area} · {item.vehicle}</p><div><span><b>{item.completedTrips}</b> completed trips</span><span><b>4.9</b> volunteer rating</span></div></article>)}</div></DataSection>}

        {view === 'impact' && <DataSection eyebrow="Community impact" title="Every handoff adds up."><div className="impact-grid"><article className="impact-feature"><span>Meals rescued</span><strong>{data.metrics.mealsRescued}</strong><p>Enough food for approximately 95 families, redirected before its collection deadline.</p></article><article><span>Waste avoided</span><strong>128<span> kg</span></strong><p>Estimated from completed rescue quantities.</p></article><article><span>Partner time saved</span><strong>19<span> hrs</span></strong><p>Coordination work handled by the agent this week.</p></article><article><span>Reliable handoffs</span><strong>{data.metrics.successfulMatches}<span>%</span></strong><p>Completed without manual rematching.</p></article></div><div className="impact-quote"><span>“</span><p>FoodBridge turns a frantic chain of calls into one approval—and gives coordinators their evenings back.</p><small>Operational outcome measured in the demo network</small></div></DataSection>}
      </section>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event)=>{ if(event.target===event.currentTarget)setModalOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="donation-title"><div className="modal-head"><div><p className="eyebrow">Start a rescue</p><h2 id="donation-title">Tell us what’s available.</h2><p>The agent will check safety constraints, capacity and distance.</p></div><button onClick={()=>setModalOpen(false)} aria-label="Close">×</button></div><form onSubmit={submitDonation}><label>Donor or business name<input name="donor" defaultValue="Palm Table Restaurant" required /></label><div className="form-grid"><label>Area<select name="area" defaultValue="Salmiya"><option>Salmiya</option><option>Hawally</option><option>Jabriya</option><option>Kuwait City</option></select></label><label>Number of meals<input name="meals" type="number" min="1" max="1000" defaultValue="36" required /></label></div><label>Food description<input name="foodType" defaultValue="Packaged vegetable rice bowls" required /></label><div className="form-grid"><label>Collect before<input name="pickupBy" type="time" defaultValue="20:30" required /></label><label className="check-label"><input name="refrigerated" type="checkbox" defaultChecked /><span><b>Requires refrigeration</b><small>Only match cold-storage partners</small></span></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setModalOpen(false)}>Cancel</button><button type="submit" className="approve-button" disabled={busy}>{busy?'Agent is matching…':'Find the best match →'}</button></div></form></section></div>}
    </main>
  );
}

function DataSection({ eyebrow, title, children }:{ eyebrow:string; title:string; children:React.ReactNode }) {
  return <section className="data-section"><div className="data-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{children}</section>;
}
