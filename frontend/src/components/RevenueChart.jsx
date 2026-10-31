import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
const data = [
  { month: "Jan", revenue: 18000 }, { month: "Feb", revenue: 22000 },
  { month: "Mar", revenue: 19500 }, { month: "Apr", revenue: 28000 },
  { month: "May", revenue: 26000 }, { month: "Jun", revenue: 34000 },
  { month: "Jul", revenue: 31500 }, { month: "Aug", revenue: 39000 },
  { month: "Sep", revenue: 36000 }, { month: "Oct", revenue: 45500 },
  { month: "Nov", revenue: 42000 }, { month: "Dec", revenue: 52000 },
];
const money = value => `$${(value / 1000).toFixed(0)}k`;
export default function RevenueChart() {
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
      <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7357f5" stopOpacity={0.22}/><stop offset="95%" stopColor="#7357f5" stopOpacity={0.01}/></linearGradient></defs>
      <CartesianGrid stroke="#eef0f6" strokeDasharray="4 4" vertical={false}/>
      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#9298aa", fontSize: 12 }} dy={10}/>
      <YAxis tickFormatter={money} axisLine={false} tickLine={false} tick={{ fill: "#9298aa", fontSize: 11 }} />
      <Tooltip formatter={value => [`$${Number(value).toLocaleString()}`, "Revenue"]} contentStyle={{ border: "1px solid #eceef4", borderRadius: 10, boxShadow: "0 8px 24px #20243a12" }}/>
      <Area type="monotone" dataKey="revenue" stroke="#7357f5" strokeWidth={2.7} fill="url(#revenueFill)" activeDot={{ r: 5, strokeWidth: 0 }}/>
    </AreaChart>
  </ResponsiveContainer></div>;
}
