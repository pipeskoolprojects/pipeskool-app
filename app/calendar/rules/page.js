"use client";
// update399: the Rules UI is withdrawn pending redesign — old links land on the calendar.
import { useEffect } from "react";
export default function RulesRedirect() { useEffect(() => { window.location.replace("/calendar"); }, []); return null; }
