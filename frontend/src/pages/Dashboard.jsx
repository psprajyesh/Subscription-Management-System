import { Users, Repeat, DollarSign, Activity, ArrowUpRight, MoreHorizontal } from "lucide-react";
import StatCard from "../components/StatCard";
import RevenueChart from "../components/RevenueChart";

const recent = [
  { initials:"SC", name:"Sophie Carter", email:"sophie.carter@email.com", plan:"Pro Annual", amount:"$299.00", status:"Paid", date:"Oct 28, 2026", color:"lavender" },
  { initials:"JM", name:"James Miller", email:"j.miller@email.com", plan:"Starter Monthly", amount:"$19.00", status:"Pending", date:"Oct 27, 2026", color:"mint" },
  { initials:"OW", name:"Olivia Wilson", email:"olivia.w@email.com", plan:"Business Annual", amount:"$599.00", status:"Paid", date:"Oct 26, 2026", color:"peach" },
  { initials:"EB", name:"Ethan Brown", email:"ethan.b@email.com", plan:"Pro Monthly", amount:"$29.00", status:"Failed", date:"Oct 25, 2026", color:"blue" },
];
export default function Dashboard() {
  return <div className="dashboard-page">
    <div className="page-intro"><div><div className="eyebrow">SATURDAY, OCTOBER 31, 2026</div><h2>Good morning, Alex <span>✦</span></h2><p>Here's what's happening with your business today.</p></div><button className="primary-button">＋ Create subscription</button></div>
    <div className="demo-notice"><span className="notice-dot"/> Preview data · Connect the backend to display live business metrics.</div>
    <section className="stats-grid">
      <StatCard label="Monthly recurring revenue" value="$48,295" change="+12.8%" note="vs. last month" Icon={DollarSign} tone="purple"/>
      <StatCard label="Active subscriptions" value="1,284" change="+8.2%" note="vs. last month" Icon={Repeat} tone="blue"/>
      <StatCard label="Total customers" value="2,845" change="+6.4%" note="vs. last month" Icon={Users} tone="green"/>
      <StatCard label="Churn rate" value="2.4%" change="-0.6%" note="vs. last month" Icon={Activity} tone="orange"/>
    </section>
    <section className="dashboard-grid">
      <article className="panel revenue-panel"><div className="panel-heading"><div><h3>Revenue overview</h3><p>Track your recurring revenue over time</p></div><select aria-label="Revenue period" defaultValue="year"><option value="year">This year</option><option value="month">This month</option></select></div><div className="revenue-summary"><strong>$48,295.00</strong><span className="trend positive"><ArrowUpRight size={14}/> 12.8%</span><small>vs. previous period</small></div><RevenueChart/></article>
      <article className="panel breakdown-panel"><div className="panel-heading"><div><h3>Subscription overview</h3><p>Current subscription status</p></div><button className="dots-button" aria-label="More"><MoreHorizontal size={19}/></button></div>
        <div className="donut-area"><div className="donut"><div><b>1,284</b><span>Total</span></div></div></div>
        <div className="legend-list"><div><i className="legend-dot active-dot"/><span>Active</span><b>1,024</b><small>79.8%</small></div><div><i className="legend-dot trial-dot"/><span>Trial</span><b>168</b><small>13.1%</small></div><div><i className="legend-dot overdue-dot"/><span>Past due</span><b>92</b><small>7.1%</small></div></div>
      </article>
    </section>
    <section className="panel transactions-panel"><div className="panel-heading"><div><h3>Recent transactions</h3><p>A quick look at your latest payments</p></div><button className="text-button">View all <ArrowUpRight size={14}/></button></div>
      <div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>PLAN</th><th>AMOUNT</th><th>STATUS</th><th>DATE</th><th></th></tr></thead><tbody>{recent.map(row=><tr key={row.email}><td><div className="customer-cell"><div className={`avatar ${row.color}`}>{row.initials}</div><div><b>{row.name}</b><span>{row.email}</span></div></div></td><td>{row.plan}</td><td className="amount-cell">{row.amount}</td><td><span className={`status-pill ${row.status.toLowerCase()}`}>{row.status}</span></td><td>{row.date}</td><td><button className="dots-button" aria-label={`More about ${row.name}`}><MoreHorizontal size={18}/></button></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
