// update473: the separate Indent screen is retired — material is ordered only from the catalogue (/m/order).
// Old links and bookmarks keep working: a link to one record (?indent=ID, e.g. from a notification) opens that
// order in My orders (/m/deliveries); anything else lands on the catalogue. Existing records are untouched.
import { redirect } from "next/navigation";

export default function OldIndentRoute({ searchParams }) {
  const id = String(searchParams?.indent || "").replace(/[^0-9]/g, "");
  redirect(id ? "/m/deliveries?indent=" + id : "/m/order");
}
