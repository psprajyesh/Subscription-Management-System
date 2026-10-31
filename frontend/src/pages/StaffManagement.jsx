import { Plus } from "lucide-react";
const columns = ["Team member", "Email", "Role", "Status"];
const rows = [["Alex Davis", "alex@brightloop.example", "Administrator", "Active"], ["Jordan Lee", "jordan@brightloop.example", "Billing manager", "Active"], ["Taylor Smith", "taylor@brightloop.example", "Support", "Invited"]];
export default function StaffManagement() {
  return <section className="module-page">
    <div className="module-intro"><div><span className="eyebrow">BRIGHTLOOP WORKSPACE</span><h2>Staff management</h2><p>Manage team members and workspace permissions.</p></div><button className="primary-button"><Plus size={16}/> Add new</button></div>
    <div className="demo-notice"><span className="notice-dot"/> Sample preview data · Records will be loaded from the API when the backend is connected.</div>
    <article className="panel module-panel"><div className="panel-heading"><div><h3>All team members</h3><p>{rows.length} sample records</p></div><input className="table-search" placeholder="Filter records..." aria-label="Filter records" onChange={e => { const q=e.target.value.toLowerCase(); document.querySelectorAll("[data-row]").forEach(row => row.hidden = !row.textContent.toLowerCase().includes(q)); }}/></div>
    <div className="table-scroll"><table><thead><tr>{columns.map(col=><th key={col}>{col.toUpperCase()}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr data-row key={i}>{row.map((cell,j)=><td key={j}>{j===row.length-1 && ["Active","Expired","Invited"].includes(cell) ? <span className={`status-pill ${cell.toLowerCase()}`}>{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div></article>
  </section>;
}
