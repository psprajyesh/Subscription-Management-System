import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
export default function AdminLayout() {
  return <div className="app-shell"><Sidebar/><main className="main-area"><Header/><div className="page-area"><Outlet/></div></main></div>;
}
