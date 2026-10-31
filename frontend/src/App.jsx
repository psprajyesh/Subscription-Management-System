import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import AdminLayout from "./layouts/AdminLayout";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Products from "./pages/Products";
import Plans from "./pages/Plans";
import Subscriptions from "./pages/Subscriptions";
import Invoices from "./pages/Invoices";
import Payments from "./pages/Payments";
import Discounts from "./pages/Discounts";
import Taxes from "./pages/Taxes";
import StaffManagement from "./pages/StaffManagement";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="products" element={<Products />} />
        <Route path="plans" element={<Plans />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="payments" element={<Payments />} />
        <Route path="discounts" element={<Discounts />} />
        <Route path="taxes" element={<Taxes />} />
        <Route path="staff" element={<StaffManagement />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
