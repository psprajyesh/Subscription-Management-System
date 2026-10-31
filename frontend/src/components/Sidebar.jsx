import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Package, CreditCard, Repeat, FileText,
  Wallet, Tag, Receipt, UserCog, BarChart3, Settings, Layers
} from "lucide-react";

const groups = [
  { label: "OVERVIEW", items: [{ to: "/", label: "Dashboard", Icon: LayoutDashboard }] },
  { label: "MANAGEMENT", items: [
    { to: "/customers", label: "Customers", Icon: Users },
    { to: "/products", label: "Products", Icon: Package },
    { to: "/plans", label: "Plans", Icon: CreditCard },
    { to: "/subscriptions", label: "Subscriptions", Icon: Repeat },
    { to: "/invoices", label: "Invoices", Icon: FileText },
    { to: "/payments", label: "Payments", Icon: Wallet },
    { to: "/discounts", label: "Discounts", Icon: Tag },
    { to: "/taxes", label: "Taxes", Icon: Receipt },
  ]},
  { label: "WORKSPACE", items: [
    { to: "/staff", label: "Staff management", Icon: UserCog },
    { to: "/reports", label: "Reports", Icon: BarChart3 },
    { to: "/settings", label: "Settings", Icon: Settings },
  ]}
];

export default function Sidebar() {
  return <aside className="sidebar">
    <div className="brand">
      <div className="brand-mark"><Layers size={22} /></div>
      <div><strong>brightloop</strong><span>SUBSCRIPTION CLOUD</span></div>
    </div>
    <div className="workspace-switch"><span className="workspace-dot" /> Brightloop workspace <span className="chevron">⌄</span></div>
    <nav className="side-nav">
      {groups.map(group => <section className="nav-group" key={group.label}>
        <p className="nav-label">{group.label}</p>
        {group.items.map(({to,label,Icon}) => <NavLink key={to} to={to} end={to === "/"} className={({isActive}) => `nav-link${isActive ? " active" : ""}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
        </NavLink>)}
      </section>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="help-card"><div className="help-icon">?</div><div><b>Need a hand?</b><span>Visit our help center</span></div></div>
      <div className="user-mini"><div className="avatar">AD</div><div><b>Admin User</b><span>Administrator</span></div><span className="more">•••</span></div>
    </div>
  </aside>;
}
