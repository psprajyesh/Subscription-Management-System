import { Plus } from "lucide-react";
const columns = ["Customer", "Email", "Subscriptions", "Joined"];
const rows = [["Maya Johnson", "maya.j@email.com", "3", "Oct 21, 2026"], ["Noah Williams", "noah.w@email.com", "1", "Oct 19, 2026"], ["Ava Thompson", "ava.t@email.com", "2", "Oct 16, 2026"]];
export default function Customers() {
  return <section className="module-page">
    <div className="module-intro"><div><span className="eyebrow">BRIGHTLOOP WORKSPACE</span><h2>Customers</h2><p>Manage customer profiles and account details.</p></div><button className="primary-button"><Plus size={16}/> Add new</button></div>
    <div className="demo-notice"><span className="notice-dot"/> Sample preview data · Records will be loaded from the API when the backend is connected.</div>
    <article className="panel module-panel"><div className="panel-heading"><div><h3>All customers</h3><p>{rows.length} sample records</p></div><input className="table-search" placeholder="Filter records..." aria-label="Filter records" onChange={e => { const q=e.target.value.toLowerCase(); document.querySelectorAll("[data-row]").forEach(row => row.hidden = !row.textContent.toLowerCase().includes(q)); }}/></div>
    <div className="table-scroll"><table><thead><tr>{columns.map(col=><th key={col}>{col.toUpperCase()}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr data-row key={i}>{row.map((cell,j)=><td key={j}>{j===row.length-1 && ["Active","Expired","Invited"].includes(cell) ? <span className={`status-pill ${cell.toLowerCase()}`}>{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div></article>
  </section>;
}
