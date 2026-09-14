import { redirect } from "next/navigation";

/** Legacy path: create-on-behalf always starts from Orders → order detail. */
export default function NewReturnPage() {
  redirect("/orders?createReturn=1");
}
