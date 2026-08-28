"use client";
// update199: Advance Salary Ledger lives INSIDE Money & Expenses now — this route just redirects.
import { useEffect } from "react";
export default function Moved() {
  useEffect(() => { window.location.replace("/expenses#advances"); }, []);
  return null;
}
