import { Bell, Search, ChevronDown, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";

const titles = {
  "/": ["Dashboard", "Your subscription business at a glance"],
  "/customers": ["Customers", "Manage your customer relationships"],
  "/products": ["Products", "Organize the products you sell"],
  "/plans": ["Plans", "Configure subscription pricing"],
  "/subscriptions": ["Subscriptions", "Track active and upcoming subscriptions"],
  "/invoices": ["Invoices", "Review and manage billing documents"],
  "/payments": ["Payments", "Monitor payment activity"],
  "/discounts": ["Discounts", "Manage promotional offers"],
  "/taxes": ["Taxes", "Configure tax rules"],
  "/staff": ["Staff management", "Manage workspace access"],
  "/reports": ["Reports", "Understand your business performance"],
  "/settings": ["Settings", "Configure your workspace"],
};

export default function Header() {
  const location = useLocation();
  const [title, subtitle] = titles[location.pathname] || titles["/"];
  return <header className="topbar">
    <div className="topbar-heading"><button className="mobile-menu" aria-label="Menu"><Menu size={20}/></button><div><h1>{title}</h1><p>{subtitle}</p></div></div>
    <div className="topbar-actions">
      <label className="search-field"><Search size={17}/><input aria-label="Search" placeholder="Search anything..." /></label>
      <button className="icon-button notification" aria-label="Notifications"><Bell size={19}/><i/></button>
      <div className="top-user"><div className="avatar">AD</div><div><b>Alex Davis</b><span>Admin</span></div><ChevronDown size={15}/></div>
    </div>
  </header>;
}
