"use client";
import Sidebar from "@/components/Sidebar";
import MyExpenses from "@/components/MyExpenses";
export default function MyExpensesPage(){return <div className="layout"><Sidebar/><div className="main" style={{padding:0,overflow:"auto"}}><MyExpenses/></div></div>}
