import { ArrowDownRight, ArrowUpRight } from "lucide-react";
export default function StatCard({ label, value, change, note, Icon, tone = "purple" }) {
  const positive = !String(change).trim().startsWith("-");
  return <article className="stat-card">
    <div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}><Icon size={19}/></div></div>
    <div className="stat-value">{value}</div>
    <div className="stat-bottom"><span className={`trend ${positive ? "positive" : "negative"}`}>{positive ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {change}</span><span>{note}</span></div>
  </article>;
}
